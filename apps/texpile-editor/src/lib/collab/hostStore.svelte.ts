// Host-side session controller: owns the Y.Doc, the relay connection, and the materializer,
// and exposes the reactive bits WorkspaceView needs. One shared session per window, host role.

import * as Y from 'yjs';
import { get } from 'svelte/store';
import { generateShareCode } from './e2e/shareCode';
import { deriveSessionKeys, sha256Hex } from './e2e/keys';
import { CollabSession, manifestOf, locksOf, metaOf, textOf, type PeerInfo } from './session';
import type { ControlPayload } from './protocol';
import { HostMaterializer, isTextFile, isShared } from './materialize';
import { RelayTransport, createRelaySession } from './transport';
import {
	readTextFile,
	writeTextFile,
	writeBinaryFile,
	scanTree,
	fileUrl,
	relativeTo,
	joinPath,
	type TreeEntry
} from '$lib/workspace/fileSystem';
import { settings } from '$lib/settings';

const toLf = (s: string) => s.replace(/\r\n?/g, '\n');

function flattenTree(children: TreeEntry[], root: string): { rel: string; size: number }[] {
	const out: { rel: string; size: number }[] = [];
	const walk = (entries: TreeEntry[]) => {
		for (const e of entries) {
			if (e.type === 'dir') walk(e.children ?? []);
			else out.push({ rel: relativeTo(root, e.path).replace(/\\/g, '/'), size: 0 });
		}
	};
	walk(children);
	return out;
}

class HostCollabController {
	active = $state(false);
	status = $state<'idle' | 'starting' | 'online' | 'reconnecting'>('idle');
	shareCode = $state('');
	peers = $state<PeerInfo[]>([]);
	lastError = $state('');
	// bumped whenever the manifest changes (seed / syncTree); the editor keys its collab binding on
	// it so a file created/renamed after seed rebinds instead of staying unshared
	manifestRev = $state(0);
	// EditSession: the host is never a guest and shows the compiled PDF from disk, not pushed bytes
	readonly isGuest = false;
	readonly guestPdf = null;

	/** WorkspaceView wires these to its compile machinery. */
	onCompileRequest: (() => void) | null = null;
	/** WorkspaceView wires this to resolve a guest's SyncTeX request and reply via replyControl. */
	onSyncRequest: ((payload: ControlPayload, from: number) => void) | null = null;

	private session: CollabSession | null = null;
	private materializer: HostMaterializer | null = null;
	private transport: RelayTransport | null = null;
	private doc: Y.Doc | null = null;
	private root: string | null = null;
	private lockedRel: string | null = null;
	private pdfBytes: Uint8Array | null = null;
	private pdfRev = 0;

	async start(root: string): Promise<void> {
		if (this.active) return;
		this.status = 'starting';
		this.lastError = '';
		try {
			const code = generateShareCode();
			const keys = await deriveSessionKeys(code);
			const hostKey = generateShareCode(); // second random secret; only its hash reaches the relay
			const relayUrl = get(settings).collabRelayUrl.trim();
			await createRelaySession(relayUrl, {
				room: keys.roomId,
				proofHash: await sha256Hex(keys.joinProof),
				hostKeyHash: await sha256Hex(hostKey)
			});

			const doc = new Y.Doc();
			const transport = new RelayTransport(relayUrl, keys.roomId, keys.joinProof, hostKey);
			const session = new CollabSession({
				doc,
				transport,
				key: keys.contentKey,
				role: 'host',
				user: { name: hostName(), color: '#2563eb' },
				events: {
					onPeersChange: (peers) => (this.peers = [...peers.values()]),
					onControl: (payload, from) => {
						if (payload.kind === 'compile-request') this.onCompileRequest?.();
						else if (payload.kind === 'synctex-inverse' || payload.kind === 'synctex-forward') void this.onSyncRequest?.(payload, from);
					},
					onBlobRequest: (name, from) => {
						if (name === 'pdf') {
							if (this.pdfBytes) session.sendBlob('pdf', this.pdfRev, this.pdfBytes, from);
						} else if (name.startsWith('f:')) {
							void this.serveFile(name, name.slice(2), from);
						}
					},
					onUpload: (path, bytes) => void this.receiveUpload(path, bytes),
					onStatus: (s) => {
						if (s === 'connected') this.status = 'online';
						else if (s === 'disconnected' || s === 'connecting') if (this.active) this.status = 'reconnecting';
					},
					onSessionEnd: () => void this.end(false)
				}
			});
			const materializer = new HostMaterializer(
				doc,
				root,
				{ readText: readTextFile, writeText: writeTextFile, listFiles: (r) => scanTree(r).then((t) => flattenTree(t.children, r)) },
				joinPath
			);
			await materializer.seed();

			this.doc = doc;
			this.session = session;
			this.materializer = materializer;
			this.transport = transport;
			this.root = root;
			this.shareCode = code;
			this.active = true;
			this.manifestRev++;
			transport.connect();
		} catch (e) {
			this.status = 'idle';
			this.lastError = e instanceof Error ? e.message : String(e);
			throw e;
		}
	}

	/** stop sharing; tellGuests=false when the teardown came from the far side. */
	async end(tellGuests = true): Promise<void> {
		const { session, materializer } = this;
		this.session = null;
		this.materializer = null;
		this.transport = null;
		this.doc = null;
		this.root = null;
		this.active = false;
		this.status = 'idle';
		this.shareCode = '';
		this.peers = [];
		this.lockedRel = null;
		this.pdfBytes = null;
		this.pdfRev = 0;
		// land any queued guest-edit writes on disk before tearing the materializer down
		await materializer?.flushAll();
		materializer?.destroy();
		if (session) {
			if (tellGuests) session.endForEveryone();
			else session.destroy();
		}
	}

	private rel(absPath: string): string | null {
		if (!this.root) return null;
		const rel = relativeTo(this.root, absPath).replace(/\\/g, '/');
		return rel === absPath.replace(/\\/g, '/') ? null : rel; // outside the root
	}

	/** every host edit funnels through here (called from scheduleSave, per keystroke). */
	hostEdit(absPath: string, content: string): void {
		const rel = this.active ? this.rel(absPath) : null;
		if (rel && isShared(rel) && isTextFile(rel)) this.materializer?.hostEdit(rel, toLf(content));
	}

	/** flush any pending guest-edit write before the host reads the file from disk. */
	async beforeOpen(absPath: string): Promise<void> {
		const rel = this.active ? this.rel(absPath) : null;
		if (rel) await this.materializer?.flush(rel);
	}

	/** the file the host holds in the visual editor (guests go read-only on it); null clears. */
	setVisualLock(absPath: string | null): void {
		if (!this.active || !this.materializer) return;
		const rel = absPath ? this.rel(absPath) : null;
		if (rel === this.lockedRel) return;
		this.materializer.setHostLock(rel, this.lockedRel);
		this.lockedRel = rel;
	}

	/** re-scan after host file ops (create/delete/rename/import/paste). */
	async syncTree(): Promise<void> {
		if (!this.active) return;
		await this.materializer?.syncFromTree();
		this.manifestRev++; // rebind the editor if the open file just became shared
	}

	// serve a file's bytes to a guest that requested it (images the guest editor needs to render)
	private async serveFile(name: string, rel: string, to: number): Promise<void> {
		if (!this.active || !this.root || !this.session) return;
		if (rel.includes('..')) return;
		try {
			const res = await fetch(fileUrl(joinPath(this.root, rel)), { cache: 'no-store' });
			if (!res.ok) return;
			this.session.sendBlob(name, 0, new Uint8Array(await res.arrayBuffer()), to);
		} catch {
			/* the guest just won't see this file */
		}
	}

	// write a file a guest uploaded (drag/paste), then re-sync so everyone sees it
	private async receiveUpload(rel: string, bytes: Uint8Array): Promise<void> {
		if (!this.active || !this.root) return;
		const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
		if (!clean || clean.includes('..')) return; // no path traversal outside the shared folder
		try {
			await writeBinaryFile(joinPath(this.root, clean), new Blob([bytes as BlobPart]));
			await this.syncTree();
		} catch {
			/* ignore a failed upload */
		}
	}

	/** host: reply to a specific guest (e.g. a resolved SyncTeX position). */
	replyControl(payload: ControlPayload, to: number): void {
		this.session?.sendControl(payload, to);
	}

	/** push a freshly compiled PDF to every guest (and keep it for late joiners). */
	async pushPdf(absPath: string): Promise<void> {
		if (!this.active || !this.session || !this.doc) return;
		try {
			const res = await fetch(fileUrl(absPath), { cache: 'no-store' });
			if (!res.ok) return;
			const bytes = new Uint8Array(await res.arrayBuffer());
			if (bytes.byteLength === 0) return;
			this.pdfBytes = bytes;
			this.pdfRev++;
			const rev = this.pdfRev;
			const name = absPath.split(/[\\/]/).pop() ?? 'output.pdf';
			// one transaction so the guest's meta observer fires once, not twice (avoids a double request)
			this.doc.transact(() => {
				metaOf(this.doc!).set('pdfRev', rev);
				metaOf(this.doc!).set('pdfName', name);
			});
			this.session.sendBlob('pdf', rev, bytes, 0);
		} catch {
			/* preview still works locally; guests just miss this round */
		}
	}

	/** Y binding for the host's source editor, when the open file is shared. */
	collabFor(absPath: string | null): { ytext: Y.Text; awareness: CollabSession['awareness'] } | null {
		if (!this.active || !this.doc || !this.session || !absPath) return null;
		const rel = this.rel(absPath);
		if (!rel || !isShared(rel) || !isTextFile(rel)) return null;
		const entry = manifestOf(this.doc).get(rel);
		if (!entry || entry.kind !== 'text' || entry.gone) return null;
		return { ytext: textOf(this.doc, rel), awareness: this.session.awareness };
	}

	/** guests currently holding a cursor in the given file (for a future indicator). */
	guestCount(): number {
		return this.peers.filter((p) => p.role === 'guest').length;
	}
}

function hostName(): string {
	try {
		return localStorage.getItem('texpile:collabName') || 'Host';
	} catch {
		return 'Host';
	}
}

export const collabHost = new HostCollabController();
export { locksOf };
