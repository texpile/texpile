// Host-side session controller: owns the Y.Doc, the relay connection, and the materializer,
// and exposes the reactive bits WorkspaceView needs. One shared session per window, host role.

import * as Y from 'yjs';
import { generateShareCode } from './e2e/shareCode';
import { deriveSessionKeys, sha256Hex } from './e2e/keys';
import { CollabSession, manifestOf, locksOf, metaOf, textOf, type PeerInfo } from './session';
import type { ControlPayload, PreviewPayload } from './protocol';
import type { SharedCompileIntel } from './editSession';
import type { RemoteEdit } from '$lib/workspace/suggestionStates';
import { commentLogOf } from './sharedComments';
import { HostMaterializer, isShared } from './materialize';
import { RelayTransport, createRelaySession } from './transport';
import {
	writeTextFile,
	writeBinaryFile,
	renameEntry,
	trashEntry,
	scanTree,
	fileUrl,
	relativeTo,
	joinPath
} from '$lib/workspace/fileSystem';
import { resolveRealRelative } from '$lib/workspace/realRelative';
import { settings } from '$lib/settings';
import { presenceIdentity } from './identity';
import { folderGitName } from '$lib/comments/author';
import { typedName } from '$lib/identity/ownName.svelte';
import { flattenShareManifest } from './shareManifest';
import { resolveSharedTarget } from './sharedPathGuard';

class HostCollabController {
	active = $state(false);
	status = $state<'idle' | 'starting' | 'online' | 'reconnecting'>('idle');
	shareCode = $state('');
	peers = $state<PeerInfo[]>([]);
	lastError = $state('');
	// text files too large to co-edit; shared view-only. Surfaced once, after seeding.
	oversizedText = $state<string[]>([]);
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
	/** WorkspaceView wires this to refresh its own tree after a guest upload/rename/delete. */
	onFileOp: (() => void) | null = null;
	/** a guest's change to a shared file as it applies, with their name and mode, for the host to record */
	onGuestEdit: ((rel: string, before: string, after: string, edit: RemoteEdit) => void) | null = null;
	/** awaited before a guest's changes are written to disk, so what they recorded is logged first */
	beforeGuestWrite: ((rel: string, content: string) => Promise<void>) | null = null;
	/** one hop of the Typst preview relay from a guest; previewRelay wires this while hosting. */
	onPreview: ((p: PreviewPayload, from: number) => void) | null = null;
	/** a guest asked its preview to follow a source position; workspaceSession wires this. */
	onTypstScroll: ((p: { file: string; line: number; character: number }, from: number) => void) | null = null;
	/** a guest's intellisense request, answered by the host's tinymist against the host's own files */
	onLspRequest: ((payload: ControlPayload, from: number) => void) | null = null;
	/** a guest asked for the raw preview page (blob 'typst-page'); previewRelay serves it. */
	onPreviewPageRequest: ((from: number) => void) | null = null;
	/** peer clientIDs, for pruning per-guest state (PeerInfo carries no id) */
	peerIds = $state<number[]>([]);
	/** the host trusts its own disk for file kinds. */
	readonly sharedKindOf = () => null;
	/** the host reads its real aux/log; only guests consume the shared copy. */
	readonly compileIntel = null;

	/** publish the parsed compile products (aux numbers + diagnostics) for guests, via meta so
	 *  late joiners pick them up from doc state instead of needing a rebroadcast. */
	shareCompileIntel(intel: SharedCompileIntel): void {
		if (!this.active || !this.doc) return;
		metaOf(this.doc).set('compileIntel', JSON.stringify(intel));
	}

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
			this.gitUserName = (await folderGitName(root))?.trim() ?? '';
			const code = generateShareCode();
			const keys = await deriveSessionKeys(code);
			const hostKey = generateShareCode(); // second random secret; the relay only ever stores its hash
			const relayUrl = settings.current.collabRelayUrl.trim();
			await createRelaySession(relayUrl, {
				room: keys.roomId,
				proofHash: await sha256Hex(keys.joinProof),
				hostKey
			});

			const doc = new Y.Doc();
			const transport = new RelayTransport(relayUrl, keys.roomId, keys.joinProof, hostKey);
			const session = new CollabSession({
				doc,
				transport,
				key: keys.contentKey,
				role: 'host',
				user: this.identity(),
				events: {
					onPeersChange: (peers) => {
						this.peers = [...peers.values()];
						this.peerIds = [...peers.keys()];
					},
					onPreview: (p, from) => this.onPreview?.(p, from),
					onControl: (payload, from) => {
						if (payload.kind === 'compile-request') this.onCompileRequest?.();
						else if (payload.kind === 'synctex-inverse' || payload.kind === 'synctex-forward') void this.onSyncRequest?.(payload, from);
						else if (payload.kind === 'file-op') void this.applyGuestFileOp(payload);
						else if (payload.kind === 'typst-scroll') this.onTypstScroll?.(payload, from);
						else if (payload.kind === 'lsp-request') this.onLspRequest?.(payload, from);
					},
					onBlobRequest: (name, from) => {
						if (name === 'pdf') {
							if (this.pdfBytes) session.sendBlob('pdf', this.pdfRev, this.pdfBytes, from);
						} else if (name === 'typst-page') {
							this.onPreviewPageRequest?.(from);
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
				{
					// texfile:// serves raw bytes with CORS; one read covers both the sniff and the body
					readBytes: async (p) => {
						const res = await fetch(fileUrl(p));
						if (!res.ok) throw new Error(`could not read ${p}`);
						return new Uint8Array(await res.arrayBuffer());
					},
					writeText: writeTextFile,
					listFiles: (r) => scanTree(r).then((t) => flattenShareManifest(t.children, r))
				},
				joinPath
			);
			materializer.onWrite = (rel, content) => this.beforeGuestWrite?.(rel, content) ?? Promise.resolve();
			materializer.senderOf = (origin) => session.senderOf(origin);
			materializer.onRemoteChange = (rel, before, after, from, gestures) =>
				this.onGuestEdit?.(rel, before, after, { ...session.authorOf(from), gestures });
			session.setSuggesting(this.suggesting);
			this.oversizedText = (await materializer.seed()).oversizedText;

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

	refreshIdentity(): void {
		this.session?.setIdentity(this.identity());
	}

	/** the folder's git user.name, which the host goes by when no name is typed in Preferences */
	private gitUserName = '';

	private identity(): ReturnType<typeof presenceIdentity> {
		return presenceIdentity('host', 0, typedName() || this.gitUserName);
	}

	private suggesting = false;

	/** the host's own mode, advertised so guests know this host records suggestions */
	setSuggesting(on: boolean): void {
		this.suggesting = on;
		this.session?.setSuggesting(on);
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
		this.oversizedText = [];
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
	edit(absPath: string, content: string, before?: string): void {
		const rel = this.active ? this.rel(absPath) : null;
		function lf(s: string) {
			return s.replace(/\r\n?/g, '\n');
		}
		// text-or-not is the manifest's call now (hostEdit checks the entry's kind itself)
		if (rel && isShared(rel)) this.materializer?.hostEdit(rel, lf(content), before === undefined ? undefined : lf(before));
	}

	/** flush any pending guest-edit write before the host reads the file from disk. */
	async beforeOpen(absPath: string): Promise<void> {
		const rel = this.active ? this.rel(absPath) : null;
		if (rel) await this.materializer?.flush(rel);
	}

	/**
	 * Land every pending guest-edit write, for a reader whose interest is not one file.
	 *
	 * A language request is that reader: completion inside `main.typ` is answered partly out of
	 * whatever `lib.typ` imports, so flushing only the file named in the request would leave a
	 * collaborator's just-typed export sitting in the debounce, unwritten and invisible.
	 * Cheap when idle - only files with a write actually queued do anything.
	 */
	async flushPendingWrites(): Promise<void> {
		if (this.active) await this.materializer?.flushAll();
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
		// only rebind editors when the shared set actually changed, not on every focus/compile refresh
		if (await this.materializer?.syncFromTree()) this.manifestRev++;
	}

	// serve a file's bytes to a guest that requested it (images the guest editor needs to render)
	private async serveFile(name: string, rel: string, to: number): Promise<void> {
		const { root, session, doc, materializer } = this;
		if (!this.active || !root || !session || !doc || !materializer?.sharesFile(rel)) return;
		// a short name like GIT~1 spells .git without saying so
		if (!(await resolveSharedTarget(root, rel, resolveRealRelative))) return;
		try {
			const res = await fetch(fileUrl(joinPath(root, rel)), { cache: 'no-store' });
			if (!res.ok) return;
			const rev = Number(manifestOf(doc).get(rel)?.rev ?? 0);
			session.sendBlob(name, rev, new Uint8Array(await res.arrayBuffer()), to);
		} catch {
			/* the guest just won't see this file */
		}
	}

	// write a file a guest uploaded (drag/paste), then re-sync so everyone sees it
	private async receiveUpload(rel: string, bytes: Uint8Array): Promise<void> {
		const root = this.root;
		if (!this.active || !root) return;
		const clean = rel.replace(/\\/g, '/').replace(/^\/+/, '');
		const target = await resolveSharedTarget(root, clean, resolveRealRelative);
		if (!target) return;
		try {
			await writeBinaryFile(joinPath(root, target), new Blob([bytes as BlobPart]));
			await this.syncTree();
			this.onFileOp?.(); // the host's own tree UI, not just the manifest
		} catch {
			/* ignore a failed upload */
		}
	}

	/** a guest's rename/delete, executed against the host's disk after path validation. */
	private async applyGuestFileOp(p: ControlPayload & { kind: 'file-op' }): Promise<void> {
		const { root, materializer } = this;
		if (!this.active || !root || !materializer) return;
		if (!materializer.sharesFile(p.from) && !materializer.sharesFolder(p.from)) return;
		if (!(await resolveSharedTarget(root, p.from, resolveRealRelative))) return;
		try {
			if (p.op === 'delete') await trashEntry(joinPath(root, p.from), root);
			else if (p.op === 'rename') {
				// the spelling a guest gave is kept: a case-only rename resolves to the file it renames
				if (!p.to || !(await resolveSharedTarget(root, p.to, resolveRealRelative))) return;
				await renameEntry(joinPath(root, p.from), joinPath(root, p.to));
			}
			await this.syncTree();
			this.onFileOp?.();
		} catch {
			/* op failed (file gone, name clash): the unchanged manifest is the guest's answer */
		}
	}

	/** the session's comment log, which the host fills from its own and writes back to disk */
	get sharedComments(): Y.Array<string> | null {
		return this.doc ? commentLogOf(this.doc) : null;
	}

	/** host: reply to a specific guest (e.g. a resolved SyncTeX position). */
	replyControl(payload: ControlPayload, to: number): void {
		this.session?.sendControl(payload, to);
	}

	/** host: tell every guest at once (e.g. diagnostics, which are not anyone's request). */
	broadcastControl(payload: ControlPayload): void {
		if (this.active) this.session?.sendControl(payload);
	}

	/**
	 * Every live co-edited text file, straight from the Y.Doc.
	 *
	 * This is the session's truth - ahead of the debounced disk write-through, and ahead of
	 * tinymist's file watcher. The guest LSP responder rebuilds the server's open documents from
	 * it, which is what lets a completion see a keystroke that landed milliseconds ago.
	 */
	sessionTextFiles(): { rel: string; text: string }[] {
		if (!this.active || !this.doc) return [];
		const out: { rel: string; text: string }[] = [];
		for (const [rel, entry] of manifestOf(this.doc).entries()) {
			if (entry.kind !== 'text' || entry.gone) continue;
			out.push({ rel, text: textOf(this.doc, rel).toString() });
		}
		return out;
	}

	/** one hop of the preview relay, down to a guest. */
	sendPreview(p: PreviewPayload, to: number): void {
		this.session?.sendPreview(p, to);
	}

	/** the raw preview page a guest asked for, over the blob channel (rev 0: it has no revisions -
	 *  it changes only with the tinymist binary, i.e. never within a session). */
	sendPreviewPage(html: string, to: number): void {
		this.session?.sendBlob('typst-page', 0, new TextEncoder().encode(html), to);
	}

	/**
	 * Advertise (or retract) a streamable live preview. Rides the meta map for the same reason
	 * compileIntel does: a guest joining late reads it from doc state instead of needing a
	 * rebroadcast, and every guest's pane flips between stream and PDF off this one flag.
	 */
	advertiseTypstPreview(on: boolean): void {
		if (!this.active || !this.doc) return;
		if (Number(metaOf(this.doc).get('typstPreview') ?? 0) !== (on ? 1 : 0)) metaOf(this.doc).set('typstPreview', on ? 1 : 0);
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
		if (!rel || !isShared(rel)) return null;
		// the manifest entry's kind IS the classification; no name-based pre-judgement
		const entry = manifestOf(this.doc).get(rel);
		if (!entry || entry.kind !== 'text' || entry.gone) return null;
		return { ytext: textOf(this.doc, rel), awareness: this.session.awareness };
	}

	/** guests currently holding a cursor in the given file (for a future indicator). */
	guestCount(): number {
		return this.peers.filter((p) => p.role === 'guest').length;
	}
}

export const collabHost = new HostCollabController();
export { locksOf };
