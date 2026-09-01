// Guest-side session controller: joins with a share code, mirrors the shared doc reactively
// for SessionView. Guests never touch the filesystem — everything lives in the Y.Doc and the
// blob channel.

import * as Y from 'yjs';
import { deriveSessionKeys } from './e2e/keys';
import { isValidShareCode } from './e2e/shareCode';
import { CollabSession, manifestOf, locksOf, metaOf, textOf, type PeerInfo, type ManifestEntry } from './session';
import { GhostDirs } from './guestGhostDirs';
import { GuestFileCache } from './guestFileCache';
import { guestColor } from './guestColors';
import { GuestSyncRequests } from './guestSyncRequests';
import { RelayTransport } from './transport';
import type { SharedCompileIntel } from './editSession';
import type { ControlPayload, PreviewPayload } from './protocol';
import type { CommentEvent } from '$lib/comments/log';
import { settings } from '$lib/settings';

export type GuestFile = {
	rel: string;
	kind: 'text' | 'binary';
	locked: boolean;
};

class GuestCollabController {
	status = $state<'idle' | 'joining' | 'online' | 'reconnecting' | 'ended'>('idle');

	/**
	 * The relay has stamped at least one frame as coming from the AUTHENTICATED host.
	 *
	 * A connected socket proves nothing: the relay accepts the connection and only then checks
	 * the join proof, so a wrong code reached 'online' for a moment. Anything watching status
	 * alone mounted the whole workspace and tore it down again a beat later.
	 */
	hostSeen = $state(false);

	/** connected AND answered by the host: the point where a workspace can safely mount. */
	get joined(): boolean {
		return (this.status === 'online' || this.status === 'reconnecting') && this.hostSeen;
	}

	private noteHost(): void {
		if (!this.hostSeen && this.session?.hostId != null) this.hostSeen = true;
	}
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
	/** the host is streaming a live Typst preview; the pane shows it instead of the pushed PDF */
	typstPreviewOffered = $state(false);
	/** the raw preview page the host shipped (blob 'typst-page'); null until asked for and answered */
	previewPage = $state<string | null>(null);
	/** WorkspaceView wires these to its comment controller. */
	onCommentEvent: ((event: CommentEvent) => void) | null = null;
	onCommentLog: ((log: string) => void) | null = null;
	/** the remote preview pane wires this; host-origin preview frames land here */
	onPreviewFrame: ((p: PreviewPayload) => void) | null = null;
	/** WorkspaceView wires this: this guest clicked the streamed preview and the host's tinymist
	 *  resolved it to a source position (manifest-relative file, zero-based line). */
	onTypstJump: ((p: { file: string; line: number }) => void) | null = null;
	/** the name this guest joined with - the identity peers see, and what comments sign as */
	selfName = $state('');
	private previewPageAsked = false;
	private fileCache = new GuestFileCache(() => this.imageRev++);
	/** subscribers to host -> guest LSP traffic; a set because each open .typ editor has a transport */
	private lspHandlers = new Set<(p: ControlPayload) => void>();
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
	private ghostState = new GhostDirs(() => this.notifyTree());

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
		this.selfName = name.trim() || 'Guest';
		try {
			const keys = await deriveSessionKeys(code);
			const relayUrl = settings.current.collabRelayUrl.trim();
			const doc = new Y.Doc();
			const transport = new RelayTransport(relayUrl, keys.roomId, keys.joinProof);
			const session = new CollabSession({
				doc,
				transport,
				key: keys.contentKey,
				role: 'guest',
				user: { name: name.trim() || 'Guest', color: guestColor(doc.clientID) },
				events: {
					onPeersChange: (peers) => {
						this.peers = [...peers.values()];
						this.noteHost();
					},
					onBlob: (blobName, rev, bytes) => {
						if (blobName === 'comments') {
							this.onCommentLog?.(new TextDecoder().decode(bytes));
						} else if (blobName === 'typst-page') {
							this.previewPage = new TextDecoder().decode(bytes);
						} else if (blobName === 'pdf') {
							this.seenPdfRev = Math.max(this.seenPdfRev, rev);
							this.pdfMaster = bytes.slice();
							this.pdf = this.pdfMaster.slice().buffer; // a copy for the viewer to consume/detach
						} else if (blobName.startsWith('f:')) {
							this.fileCache.receive(blobName.slice(2), rev, bytes);
						}
					},
					onPreview: (p) => this.onPreviewFrame?.(p),
					onControl: (payload) => {
						if (payload.kind === 'comment-event') this.onCommentEvent?.(payload.event);
						else if (payload.kind === 'synctex-inverse-result' || payload.kind === 'synctex-forward-result') {
							this.syncRequests.resolve(payload);
						} else if (payload.kind === 'typst-jump') this.onTypstJump?.(payload);
						else if (payload.kind === 'lsp-result' || payload.kind === 'lsp-notify') {
							for (const h of this.lspHandlers) h(payload);
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
		this.noteHost();
		const locks = locksOf(this.doc);
		const out: GuestFile[] = [];
		for (const [rel, entry] of manifestOf(this.doc).entries()) {
			const e = entry as ManifestEntry;
			if (e.gone) continue;
			out.push({ rel, kind: e.kind, locked: locks.has(rel) });
		}
		out.sort((a, b) => a.rel.localeCompare(b.rel));
		this.ghostState.prune(out);
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
		return this.ghostState.list();
	}

	addGhostDir(rel: string): void {
		this.ghostState.add(rel);
	}

	/** true when rel was a ghost (handled locally); false means it's a real, host-side entry. */
	dropGhostDir(rel: string): boolean {
		return this.ghostState.drop(rel);
	}

	/** true when rel was a ghost and got renamed locally. */
	renameGhostDir(from: string, to: string): boolean {
		return this.ghostState.rename(from, to);
	}

	/** ask the host (the only disk-writer) to rename/delete; the manifest brings the result back. */
	requestFileOp(op: 'rename' | 'delete', from: string, to?: string): void {
		this.session?.sendControl({ kind: 'file-op', op, from, to });
	}

	/**
	 * A review-comment event of ours, up to the host.
	 *
	 * Sent, not applied here first - the host owns the log and echoes it back to everyone, so a
	 * guest's own comment reaches it the same way anyone else's does. It also means an event made
	 * while the host is away is simply lost rather than silently local-only.
	 */
	sendComment(event: CommentEvent): void {
		this.session?.sendControl({ kind: 'comment-event', event });
	}

	/** ask for the whole log; the host answers on the blob channel. */
	requestComments(): void {
		this.session?.requestBlob('comments');
	}

	/**
	 * Ask for the raw preview page. Asked once per session normally; `again` retries after a
	 * failed attach, covering the host whose preview task was not up when the first ask arrived
	 * (it does not answer rather than answering wrongly).
	 */
	requestPreviewPage(again = false): void {
		if (this.previewPageAsked && !again) return;
		this.previewPageAsked = true;
		this.session?.requestBlob('typst-page');
	}

	/** one hop of the preview relay, up to the host. */
	sendPreview(p: PreviewPayload): void {
		this.session?.sendPreview(p);
	}

	private onMeta(): void {
		if (!this.doc || !this.session) return;
		this.typstPreviewOffered = Number(metaOf(this.doc).get('typstPreview') ?? 0) === 1;
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
		if (this.joinTimer) clearTimeout(this.joinTimer);
		this.joinTimer = null;
	}

	/** hand the viewer a fresh, intact copy (call before re-showing a PDF pane that was closed). */
	refreshPdfView(): void {
		if (this.pdfMaster) this.pdf = this.pdfMaster.slice().buffer;
	}

	ytextFor(rel: string): Y.Text | null {
		return this.doc ? textOf(this.doc, rel) : null;
	}

	/** object URL for a file the host serves on demand (images); '' until it arrives. */
	fileUrl(rel: string): string {
		void this.imageRev; // reactive: re-run when the bytes land
		void this.rev; // and when the manifest moves, since that is what carries a new file rev
		// the manifest entry's rev is the host's revision for the bytes on its disk
		const rev = this.doc ? Number((manifestOf(this.doc).get(rel) as ManifestEntry | undefined)?.rev ?? 0) : 0;
		return this.fileCache.urlFor(rel, rev, this.session ? (name) => this.session?.requestBlob(name) : null);
	}

	/** send a new file to the host, which writes it to disk (drag-in / paste / upload). */
	uploadFile(rel: string, bytes: Uint8Array): void {
		this.session?.sendUpload(rel, bytes);
	}

	/** SyncTeX asks ride the control channel; see GuestSyncRequests */
	private syncRequests = new GuestSyncRequests((p) => {
		if (!this.session) return false;
		this.session.sendControl(p);
		return true;
	});
	syncInverse = (page: number, x: number, y: number) => this.syncRequests.inverse(page, x, y);
	syncForward = (file: string, line: number) => this.syncRequests.forward(file, line);

	/**
	 * The session as an LSP transport's back end: a guest's intellisense is the host's tinymist,
	 * reached over these frames. Sends are dropped when there is no session rather than queued -
	 * a completion nobody is waiting for any more is not worth delivering late.
	 */
	lspPort(): { send(p: ControlPayload): void; subscribe(h: (p: ControlPayload) => void): () => void } {
		return {
			send: (p) => this.session?.sendControl(p),
			subscribe: (h) => {
				this.lspHandlers.add(h);
				return () => this.lspHandlers.delete(h);
			}
		};
	}

	/** Typst src -> preview: ask the host to resolve this position; the jump comes back over the
	 *  preview channel routed to only this guest. Fire-and-forget - an unresolvable position is a
	 *  silent no-op server-side, so there is nothing to await. */
	requestTypstScroll(rel: string, line: number, character: number): void {
		this.session?.sendControl({ kind: 'typst-scroll', file: rel, line, character });
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
		this.hostSeen = false;
		this.fileWatchers.clear();
		// revoke, don't just drop: these are object URLs, and a surviving entry would also let the
		// next session render a previous host's image for a path that happens to match
		this.fileCache.clear();
		this.ghostState.clear();
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
		this.typstPreviewOffered = false;
		this.previewPage = null;
		this.previewPageAsked = false;
		this.onPreviewFrame = null;
		this.onTypstJump = null;
		this.selfName = '';
		this.seenPdfRev = 0;
		this.requestedPdfRev = 0;
		if (destroySession) session?.destroy();
	}
}

export const collabGuest = new GuestCollabController();
