// Guest-side session controller: joins with a share code, mirrors the shared doc reactively
// for SessionView. Guests never touch the filesystem — everything lives in the Y.Doc and the
// blob channel.

import * as Y from 'yjs';
import { get } from 'svelte/store';
import { deriveSessionKeys } from './e2e/keys';
import { isValidShareCode } from './e2e/shareCode';
import { CollabSession, manifestOf, locksOf, metaOf, textOf, type PeerInfo, type ManifestEntry } from './session';
import { spliceDiff, EDIT_ORIGIN } from './materialize';
import { RelayTransport } from './transport';
import type { EditSession, SharedCompileIntel } from './editSession';
import type { ControlPayload } from './protocol';
import { settings } from '$lib/settings';

export interface GuestFile {
	rel: string;
	kind: 'text' | 'binary';
	locked: boolean;
}

class GuestCollabController {
	status = $state<'idle' | 'joining' | 'online' | 'reconnecting' | 'ended'>('idle');
	/** why the session ended, for the goodbye screen. */
	endedReason = $state<'host-ended' | 'relay-closed' | 'quota' | 'error' | ''>('');
	joinError = $state('');
	hostOnline = $state(true);
	files = $state<GuestFile[]>([]);
	peers = $state<PeerInfo[]>([]);
	pdf = $state<ArrayBuffer | null>(null);
	pdfName = $state('');
	// bumped on every manifest/lock change; the editor keys its binding on it (mirrors the host's manifestRev)
	rev = $state(0);
	// bumped when a host-served file (image) arrives, so fileUrl() callers re-render
	imageRev = $state(0);
	// the host's parsed compile products (aux numbers + diagnostics), from the session meta map
	compileIntel = $state<SharedCompileIntel | null>(null);
	private imageCache = new Map<string, { rev: number; url: string }>(); // rel -> the host's bytes at a rev
	private imageReq = new Set<string>(); // in-flight 'rel@rev' requests, so we ask once per revision
	private syncResolvers = new Map<number, (r: ControlPayload) => void>();
	private syncSeq = 0;
	// intact master; `pdf` is always a copy, because pdf.js detaches the ArrayBuffer it renders and
	// a re-render (pane re-open) would otherwise get an emptied buffer
	private pdfMaster: Uint8Array | null = null;

	private doc: Y.Doc | null = null;
	private session: CollabSession | null = null;
	private transport: RelayTransport | null = null;
	private seenPdfRev = 0;
	private requestedPdfRev = 0;
	private joinTimer: ReturnType<typeof setTimeout> | null = null;
	// fired when the shared file set changes; the guest's WorkspaceProvider re-scans off this
	private fileWatchers = new Set<() => void>();
	// guest-local empty folders (git model: a folder is nothing until a file lands inside it).
	// They live only in this tree view; the first file created inside reaches the host and makes
	// the folder real, at which point the ghost is pruned.
	private ghosts = new Set<string>();

	/** subscribe to file-tree changes (the CRDT manifest); returns an unsubscribe. */
	subscribe(cb: () => void): () => void {
		this.fileWatchers.add(cb);
		return () => this.fileWatchers.delete(cb);
	}

	get awareness() {
		return this.session?.awareness ?? null;
	}

	async join(code: string, name: string): Promise<void> {
		// also bail while reconnecting: a second join would build a fresh transport and orphan the old
		// one (its backoff loop keeps running), leaking a socket
		if (this.status === 'joining' || this.status === 'online' || this.status === 'reconnecting') return;
		this.joinError = '';
		if (!isValidShareCode(code)) {
			this.joinError = 'invalid-code';
			return;
		}
		this.status = 'joining';
		try {
			const keys = await deriveSessionKeys(code);
			const relayUrl = get(settings).collabRelayUrl.trim();
			const doc = new Y.Doc();
			const transport = new RelayTransport(relayUrl, keys.roomId, keys.joinProof);
			const session = new CollabSession({
				doc,
				transport,
				key: keys.contentKey,
				role: 'guest',
				user: { name: name.trim() || 'Guest', color: guestColor(doc.clientID) },
				events: {
					onPeersChange: (peers) => (this.peers = [...peers.values()]),
					onBlob: (blobName, rev, bytes) => {
						if (blobName === 'pdf') {
							this.seenPdfRev = Math.max(this.seenPdfRev, rev);
							this.pdfMaster = bytes.slice();
							this.pdf = this.pdfMaster.slice().buffer; // a copy for the viewer to consume/detach
						} else if (blobName.startsWith('f:')) {
							this.receiveFileBlob(blobName.slice(2), rev, bytes);
						}
					},
					onControl: (payload) => {
						if (payload.kind === 'synctex-inverse-result' || payload.kind === 'synctex-forward-result') {
							this.syncResolvers.get(payload.reqId)?.(payload);
							this.syncResolvers.delete(payload.reqId);
						}
					},
					onStatus: (s) => {
						if (s === 'connected') {
							this.clearJoinTimer();
							this.status = 'online';
							this.hostOnline = true;
						} else if (s === 'disconnected') {
							if (this.status === 'online') this.status = 'reconnecting';
						} else if (s === 'host-gone') this.hostOnline = false;
						else if (s === 'host-back') this.hostOnline = true;
					},
					onSessionEnd: (reason) => {
						this.clearJoinTimer();
						// a join-time rejection (unknown code, full room) is a join failure, not a
						// mid-session end — surface it on the join form instead of the goodbye screen
						if (reason === 'no-session' || reason === 'full') {
							this.joinError = reason === 'full' ? 'session-full' : 'no-session';
							this.teardown(false);
							this.status = 'idle';
						} else {
							this.endedReason = reason;
							this.status = 'ended';
							this.teardown(false);
						}
					}
				}
			});

			const refresh = () => this.refreshFromDoc();
			manifestOf(doc).observe(refresh);
			locksOf(doc).observe(refresh);
			metaOf(doc).observe(() => this.onMeta());

			this.doc = doc;
			this.session = session;
			this.transport = transport;
			transport.connect();

			// belt-and-braces: the relay now closes with a specific code for a bad join, but if it's
			// unreachable entirely we'd otherwise spin — surface a timeout. Cleared on connect/teardown.
			this.joinTimer = setTimeout(() => {
				if (this.status === 'joining') {
					this.joinError = 'no-session';
					this.leave();
				}
			}, 8000);
		} catch (e) {
			this.status = 'idle';
			this.joinError = e instanceof Error ? e.message : String(e);
		}
	}

	private refreshFromDoc(): void {
		if (!this.doc) return;
		const locks = locksOf(this.doc);
		const out: GuestFile[] = [];
		for (const [rel, entry] of manifestOf(this.doc).entries()) {
			const e = entry as ManifestEntry;
			if (e.gone) continue;
			out.push({ rel, kind: e.kind, locked: locks.has(rel) });
		}
		out.sort((a, b) => a.rel.localeCompare(b.rel));
		// a ghost folder becomes real once a shared file lands inside it
		for (const g of this.ghosts) if (out.some((f) => f.rel.startsWith(g + '/'))) this.ghosts.delete(g);
		this.files = out;
		// bump the rebind key only when the shared SET changed (a file added/removed/became shared),
		// not on a lock flip: that just updates `files`, and the editor's read-only state live-flips
		// through it, so remounting would needlessly drop the guest's caret and undo history
		const sig = out.map((f) => `${f.rel}:${f.kind}`).join('|');
		if (sig !== this.lastManifestSig) {
			this.lastManifestSig = sig;
			this.rev++;
		}
		for (const cb of this.fileWatchers) cb();
	}
	private lastManifestSig = '';

	private notifyTree(): void {
		this.rev++;
		for (const cb of this.fileWatchers) cb();
	}

	get ghostDirs(): string[] {
		return [...this.ghosts];
	}

	addGhostDir(rel: string): void {
		if (!rel) return;
		this.ghosts.add(rel);
		this.notifyTree();
	}

	/** true when rel was a ghost (handled locally); false means it's a real, host-side entry. */
	dropGhostDir(rel: string): boolean {
		const hit = this.ghosts.delete(rel);
		// deleting a ghost parent takes its ghost children with it
		for (const g of this.ghosts) if (g.startsWith(rel + '/')) this.ghosts.delete(g);
		if (hit) this.notifyTree();
		return hit;
	}

	/** true when rel was a ghost and got renamed locally. */
	renameGhostDir(from: string, to: string): boolean {
		if (!this.ghosts.delete(from)) return false;
		this.ghosts.add(to);
		for (const g of [...this.ghosts]) {
			if (g.startsWith(from + '/')) {
				this.ghosts.delete(g);
				this.ghosts.add(to + g.slice(from.length));
			}
		}
		this.notifyTree();
		return true;
	}

	/** ask the host (the only disk-writer) to rename/delete; the manifest brings the result back. */
	requestFileOp(op: 'rename' | 'delete', from: string, to?: string): void {
		this.session?.sendControl({ kind: 'file-op', op, from, to });
	}

	private onMeta(): void {
		if (!this.doc || !this.session) return;
		const rev = Number(metaOf(this.doc).get('pdfRev') ?? 0);
		this.pdfName = String(metaOf(this.doc).get('pdfName') ?? '');
		// a rev we haven't seen means we missed the broadcast (joined late / was offline): ask once.
		// requestedPdfRev guards against a re-request storm if the meta map churns.
		if (rev > this.seenPdfRev && rev > this.requestedPdfRev) {
			this.requestedPdfRev = rev;
			this.session.requestBlob('pdf');
		}
		const intel = metaOf(this.doc).get('compileIntel');
		if (typeof intel === 'string') {
			try {
				this.compileIntel = JSON.parse(intel) as SharedCompileIntel;
			} catch {
				/* a malformed payload just means no shared numbers */
			}
		}
	}

	private clearJoinTimer(): void {
		if (this.joinTimer) {
			clearTimeout(this.joinTimer);
			this.joinTimer = null;
		}
	}

	/** hand the viewer a fresh, intact copy (call before re-showing a PDF pane that was closed). */
	refreshPdfView(): void {
		if (this.pdfMaster) this.pdf = this.pdfMaster.slice().buffer;
	}

	ytextFor(rel: string): Y.Text | null {
		return this.doc ? textOf(this.doc, rel) : null;
	}

	private receiveFileBlob(rel: string, rev: number, bytes: Uint8Array): void {
		const old = this.imageCache.get(rel);
		if (old) URL.revokeObjectURL(old.url);
		this.imageCache.set(rel, { rev, url: URL.createObjectURL(new Blob([bytes as BlobPart])) });
		this.imageReq.delete(rel + '@' + rev);
		this.imageRev++;
	}

	/** the host's revision for a shared binary; changes when the bytes on its disk do. */
	private fileRevOf(rel: string): number {
		if (!this.doc) return 0;
		return Number((manifestOf(this.doc).get(rel) as ManifestEntry | undefined)?.rev ?? 0);
	}

	/** object URL for a file the host serves on demand (images); '' until it arrives. */
	fileUrl(rel: string): string {
		void this.imageRev; // reactive: re-run when the bytes land
		void this.rev; // and when the manifest moves, since that is what carries a new file rev
		const rev = this.fileRevOf(rel);
		const hit = this.imageCache.get(rel);
		if (hit && hit.rev === rev) return hit.url;
		// missing, or the host replaced the file since we cached it: fetch that revision once
		const key = rel + '@' + rev;
		if (rel && !this.imageReq.has(key) && this.session) {
			this.imageReq.add(key);
			this.session.requestBlob('f:' + rel);
		}
		// keep showing the stale copy while the fresh one is in flight, rather than blanking
		return hit?.url ?? '';
	}

	/** send a new file to the host, which writes it to disk (drag-in / paste / upload). */
	uploadFile(rel: string, bytes: Uint8Array): void {
		this.session?.sendUpload(rel, bytes);
	}

	/** ask the host to resolve a SyncTeX position (it holds the .synctex data); null on timeout. */
	private syncRequest(
		base: { kind: 'synctex-inverse'; page: number; x: number; y: number } | { kind: 'synctex-forward'; file: string; line: number }
	): Promise<ControlPayload | null> {
		if (!this.session) return Promise.resolve(null);
		const reqId = ++this.syncSeq;
		const payload = { ...base, reqId } as ControlPayload;
		return new Promise((resolve) => {
			this.syncResolvers.set(reqId, resolve);
			this.session!.sendControl(payload);
			setTimeout(() => {
				if (this.syncResolvers.delete(reqId)) resolve(null);
			}, 4000);
		});
	}
	async syncInverse(page: number, x: number, y: number): Promise<{ file: string; line: number; selectText?: string } | null> {
		const r = await this.syncRequest({ kind: 'synctex-inverse', page, x, y });
		return r && r.kind === 'synctex-inverse-result' ? { file: r.file, line: r.line, selectText: r.selectText } : null;
	}
	async syncForward(file: string, line: number): Promise<{ page: number; x: number; y: number; w?: number; h?: number } | null> {
		const r = await this.syncRequest({ kind: 'synctex-forward', file, line });
		return r && r.kind === 'synctex-forward-result' ? { page: r.page, x: r.x, y: r.y, w: r.w, h: r.h } : null;
	}

	isLocked(rel: string): boolean {
		return this.files.find((f) => f.rel === rel)?.locked ?? false;
	}

	requestCompile(): void {
		this.session?.sendControl({ kind: 'compile-request' });
	}

	leave(): void {
		this.teardown(true);
		if (this.status !== 'ended') {
			this.status = 'idle';
			this.endedReason = '';
		}
	}

	/** back to a clean slate (from the goodbye screen). */
	reset(): void {
		this.teardown(true);
		this.status = 'idle';
		this.endedReason = '';
		this.joinError = '';
	}

	private teardown(destroySession: boolean): void {
		this.clearJoinTimer();
		this.fileWatchers.clear();
		// revoke, don't just drop: these are object URLs, and a surviving entry would also let the
		// next session render a previous host's image for a path that happens to match
		for (const { url } of this.imageCache.values()) URL.revokeObjectURL(url);
		this.imageCache.clear();
		this.imageReq.clear();
		this.ghosts.clear();
		const session = this.session;
		this.session = null;
		this.transport = null;
		this.doc = null;
		this.files = [];
		this.peers = [];
		this.pdf = null;
		this.pdfMaster = null;
		this.pdfName = '';
		this.hostOnline = true;
		this.compileIntel = null;
		this.seenPdfRev = 0;
		this.requestedPdfRev = 0;
		if (destroySession) session?.destroy();
	}
}

const GUEST_COLORS = ['#e11d48', '#d97706', '#059669', '#7c3aed', '#0891b2', '#c026d3', '#65a30d', '#ea580c'];
function guestColor(clientId: number): string {
	return GUEST_COLORS[clientId % GUEST_COLORS.length];
}

export const collabGuest = new GuestCollabController();

// adapts the guest controller to the EditSession shape WorkspaceView drives; host-only methods
// are no-ops (a guest owns no disk, never materializes, never compiles)
export const guestSession: EditSession = {
	get active() {
		return collabGuest.status === 'online' || collabGuest.status === 'reconnecting';
	},
	isGuest: true,
	get manifestRev() {
		return collabGuest.rev;
	},
	get guestPdf() {
		return collabGuest.pdf;
	},
	onCompileRequest: null,
	onSyncRequest: null,
	onFileOp: null,
	shareCompileIntel() {},
	get compileIntel() {
		return collabGuest.compileIntel;
	},
	sharedKindOf(path) {
		if (!path) return null;
		return collabGuest.files.find((f) => f.rel === path)?.kind ?? null;
	},
	collabFor(path) {
		if (!path) return null;
		const ytext = collabGuest.ytextFor(path);
		const awareness = collabGuest.awareness;
		return ytext && awareness ? { ytext, awareness, readOnly: collabGuest.isLocked(path) } : null;
	},
	// the guest visual editor's write path: fold the serialized doc into the shared Y.Text as a
	// minimal splice; the change syncs to the host, whose materializer lands it on disk. The
	// source editor is Y-bound, so its calls arrive content-equal and splice nothing.
	edit(path, content) {
		if (!path || collabGuest.isLocked(path)) return;
		const t = collabGuest.ytextFor(path);
		if (!t) return;
		const diff = spliceDiff(t.toString(), content.replace(/\r\n?/g, '\n'));
		if (!diff) return;
		t.doc?.transact(() => {
			if (diff.remove > 0) t.delete(diff.index, diff.remove);
			if (diff.insert) t.insert(diff.index, diff.insert);
		}, EDIT_ORIGIN);
	},
	async beforeOpen() {},
	setVisualLock() {},
	async syncTree() {},
	async pushPdf() {},
	async end() {
		collabGuest.leave();
	},
	guestCount() {
		return collabGuest.peers.length;
	}
};
