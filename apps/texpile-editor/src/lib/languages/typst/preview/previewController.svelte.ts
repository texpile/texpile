// tinymist's incremental viewer in the preview pane, host end to end: task lifecycle (start,
// retarget, crash recovery), caret follow and one-shot forward sync, the preview's click-to-jump,
// the guest stream relay, and the LSP diagnostics that feed the Problems panel while Preview is
// on. WorkspaceView instantiates one and hands the pane its state.
import { workspaceRoot, mainFile } from '$lib/workspace/workspaceStore';
import { compileLog } from '$lib/stores/compileLogStore';
import { sourceCmView } from '$lib/stores/editorStore';
import { settings } from '$lib/settings';
import { toaster } from '$lib/modals/toaster-svelte';
import { toastMissingTool } from '$lib/workspace/toolMissing';
import { trailingDebounce } from '$lib/trailingDebounce';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { collabGuest } from '$lib/collab/guestStore.svelte';
import { previewRelay } from '$lib/collab/previewRelay.svelte';
import { joinPath } from '$lib/workspace/fileSystem';
import { relFromRoot } from '$lib/workspace/compilePipeline.svelte';
import {
	tinymistResolved,
	setPreviewJumpHandler,
	setTypstDiagnosticsHandler,
	typstServerGen,
	type TypstDiagnostic
} from '../intellisense/lspClient';
import { startTypstPreview, killTypstPreview, scrollTypstPreview } from './previewCommands';
import { typstProblemsLog } from './previewProblems';
import { noteFollowScroll } from './followSignal';
import { m } from '$lib/paraglide/messages';

export type TypstPreviewHooks = {
	getGuest: () => boolean;
	/** reactive: the main file, which is always the previewed document */
	getMainFile: () => string | null;
	/** reactive: the project's Preview switch */
	getPreviewSwitchOn: () => boolean;
	/** reactive: candidate count, for the "no main set" pane message */
	getTexFileCount: () => number;
	/** reactive: the pane the preview renders into */
	getPaneOpen: () => boolean;
	setPaneOpen: (open: boolean) => void;
	setPreviewSwitch: (root: string | null, on: boolean) => void;
	getDocPath: () => string | null;
	getFollow: () => boolean;
	/** the visual caret as a zero-based source position, through the view's block map */
	getVisualCaretSourcePos: () => { line: number; character: number } | null;
	/** inverse-sync landing, shared with SyncTeX: visual stays visual, source jumps the line */
	syncJumpToFileLine: (file: string, line: number, column?: number) => void;
};

export class TypstPreviewController {
	/** the data plane port of the running preview; null when none has been started */
	host = $state<string | null>(null);
	/** the server's handle for the running task, needed to stop it */
	private task: string | null = null;
	/** guards against a second attach while the first executeCommand is still in flight */
	private starting = false;
	/** the document the running task was started FOR; a main switch away from it re-attaches */
	private attachedFile: string | null = null;
	/** tinymist was not found at the last start. No retry until the preview is switched off and on or the Toolchain
	 *  folders change: anything the start reads can re-run it (a config re-read after every save did), and each run toasted */
	private tinymistMissing = $state(false);

	private readonly hooks: TypstPreviewHooks;

	constructor(hooks: TypstPreviewHooks) {
		this.hooks = hooks;
		this.attachEffects();
	}

	/** the previewed document: the main file, always (`wanted` holds otherwise) */
	get file(): string | null {
		return mainFile.current;
	}

	get mainIsTypst(): boolean {
		return this.hooks.getMainFile()?.toLowerCase().endsWith('.typ') === true;
	}

	/** this pane is FOR a Typst preview, whether or not one has attached yet */
	get wanted(): boolean {
		return this.mainIsTypst && this.hooks.getPreviewSwitchOn() && !this.hooks.getGuest();
	}

	/**
	 * No main file in a folder that has candidates: the pane can only show something wrong
	 * (a stale PDF, a fragment compile), so it shows a message and the picker instead.
	 */
	get mainUnset(): boolean {
		return !this.hooks.getGuest() && !this.hooks.getMainFile() && this.hooks.getTexFileCount() > 0;
	}

	/**
	 * The palette / Compile-button entry. Turns the switch on and opens the pane rather than
	 * attaching directly: attaching behind a switch that says "off" would last exactly until
	 * the demand effect noticed.
	 */
	enable(): void {
		this.hooks.setPreviewSwitch(workspaceRoot.current, true);
		this.hooks.setPaneOpen(true);
	}

	private async open(): Promise<void> {
		const root = workspaceRoot.current;
		const file = this.file;
		if (!root || !file) return;
		try {
			// Started through the LANGUAGE SERVER, so it previews the server's in-memory document and
			// follows typing without a save. Deliberately no flushSaves() here: needing one would mean
			// we had started a standalone `tinymist preview`, which reads the file instead.
			const target = await startTypstPreview(root, file);
			if (!target) {
				// "tinymist isn't installed" gets the same tool-missing toast the shell compile
				// shows (name + the install); only a resolved-but-failed start falls through to
				// the generic failure below
				if (!(await tinymistResolved())) {
					this.tinymistMissing = true;
					await toastMissingTool('tinymist');
					return;
				}
				throw new Error('tinymist did not return a preview address');
			}
			this.attachedFile = file;
			this.host = target.host;
			this.task = target.taskId;
		} catch (err) {
			toaster.error({ title: m.typst_preview_failed(), description: err instanceof Error ? err.message : String(err) });
		}
	}

	/**
	 * Tell the server to stop compiling for a preview nobody is watching. Dropping the socket
	 * only detaches this end; the task lives on in the language server until it is killed, so
	 * without this each open-and-close would leave one behind.
	 */
	private detach(): void {
		this.sendCaretScroll.cancel(); // a scroll landing after the kill would be for a dead task
		this.attachedFile = null;
		const task = this.task;
		this.task = null;
		if (task) void killTypstPreview(workspaceRoot.current, task);
	}

	/** Where a follow/sync can go: the local task, or - as a guest - the host's streamed preview. */
	private scrollTarget(): 'local' | 'remote' | null {
		if (this.host !== null && this.task) return 'local';
		if (this.hooks.getGuest() && collabGuest.typstPreviewOffered) return 'remote';
		return null;
	}

	/** The manifest-relative path of `file`, for a guest's scroll request. A guest's doc paths are
	 *  ALREADY manifest-relative (its workspaceRoot is the 'session' sentinel, not a prefix of
	 *  them); only a 'session/'-prefixed jump target needs stripping, and an absolute path is not
	 *  the session's to ask about. */
	private guestScrollRel(file: string): string | null {
		const norm = file.replace(/\\/g, '/');
		const root = workspaceRoot.current;
		if (root && norm.startsWith(root.replace(/\\/g, '/') + '/')) return norm.slice(root.length + 1);
		return /^([A-Za-z]:|\/)/.test(norm) ? null : norm;
	}

	private sendScroll(file: string, line: number, character: number): void {
		if (this.scrollTarget() === 'remote') {
			const rel = this.guestScrollRel(file);
			if (rel) collabGuest.requestTypstScroll(rel, line, character);
			return;
		}
		if (this.task) void scrollTypstPreview(workspaceRoot.current, this.task, file, line, character);
	}

	/**
	 * Make the preview follow the caret (src -> doc). Opt-in: tinymist's own default follows only
	 * mouse-driven selection changes, because a preview that jumps on every keystroke is unpleasant.
	 *
	 * The COLUMN is load-bearing, not garnish: the server resolves the position through
	 * jump_from_cursor, which only matches when the syntax leaf ending at the cursor is text.
	 * Column 0 sits after a linebreak, never after text, so sending it resolves to nothing.
	 *
	 * Debounced trailing: the caret hook fires per column change, i.e. every keystroke.
	 */
	private readonly sendCaretScroll = trailingDebounce(150, ({ line, character }: { line: number; character: number }) => {
		if (this.scrollTarget() === null) return;
		if (!this.hooks.getFollow()) return;
		// the FOCUSED file, not the main one: the caret is in the file being edited, and pairing
		// it with main.typ's path asks the server to resolve a position that does not exist
		const file = this.hooks.getDocPath();
		if (!file) return;
		// follow jumps are ambient: warn the frame so it swallows the viewer's jump ripple.
		// One-shot syncs (syncForward and friends) deliberately do NOT send this.
		noteFollowScroll();
		this.sendScroll(file, line, character);
	});

	onCaretMove(line: number, character: number): void {
		// gate before enqueueing too, so an off switch means no timer churn while typing
		if (this.scrollTarget() === null || !this.hooks.getFollow()) return;
		this.sendCaretScroll({ line, character });
	}

	/**
	 * Visual-mode follow: the PM caret has no source line of its own, so it goes through the
	 * view's source map - block-granular from the parse's block runs, refined inside the block by
	 * text anchoring, the same machinery the mode switch uses to carry the caret across.
	 */
	private readonly sendVisualCaretScroll = trailingDebounce(150, (_: null) => {
		if (this.scrollTarget() === null) return;
		if (!this.hooks.getFollow()) return;
		const file = this.hooks.getDocPath();
		if (!file) return;
		const pos = this.hooks.getVisualCaretSourcePos();
		if (!pos) return; // no resolvable position on that line at all
		noteFollowScroll();
		this.sendScroll(file, pos.line, pos.character);
	});

	onVisualCaretMove(): void {
		if (this.scrollTarget() === null || !this.hooks.getFollow()) return;
		this.sendVisualCaretScroll(null);
	}

	/** The rendered sync entry points only exist when a preview target should too, but wanted is
	 * not attached - tinymist may still be starting or have died - and MCP's syncToLine bypasses
	 * the gate entirely. Typst has no SyncTeX: only the live preview can resolve a source
	 * position, so explain the miss instead of silently no-oping. */
	private syncUnavailable(): boolean {
		if (this.scrollTarget() !== null) return false;
		toaster.info({ title: m.typst_sync_preview_only_title(), description: m.typst_sync_preview_only_desc(), duration: 5000 });
		return true;
	}

	/**
	 * One-shot src -> preview jump: the counterpart of SyncTeX's forward search, and the same
	 * server call follow uses - fired once, on demand, so it earns its place exactly when the
	 * follow toggle is off.
	 */
	syncForward(): void {
		if (this.syncUnavailable()) return;
		const file = this.hooks.getDocPath();
		if (!file) return;
		const cm = sourceCmView.current;
		if (cm && cm.dom.isConnected) {
			const head = cm.state.selection.main.head;
			const docLine = cm.state.doc.lineAt(head);
			this.sendScroll(file, docLine.number - 1, head - docLine.from);
			return;
		}
		// Visual mode: the PM caret through the block map, one shot (no follow bookkeeping). The
		// map measures against the buffer, and so does the server: the visual editor streams it
		// (TypstDocumentStream), and the scroll syncs the edits still in the debounce before it
		// asks. No save needed.
		const pos = this.hooks.getVisualCaretSourcePos();
		if (!pos) return;
		this.sendScroll(file, pos.line, pos.character);
	}

	/**
	 * Line-based variant for the context menu's "Show in preview" and MCP's syncToLine. A line
	 * has no column, and the column decides whether tinymist resolves anything at all, so aim
	 * just past the line's last non-space character - a heading resolves through its text, and a
	 * markup-only line (#set ...) resolves to nothing, exactly as follow would.
	 */
	/** a guest's follow/sync request, relayed by the session: resolve it against the local task */
	scrollForGuest(rel: string, line: number, character: number): void {
		const root = workspaceRoot.current;
		if (!root || !this.task) return;
		void scrollTypstPreview(root, this.task, joinPath(root, rel), line, character);
	}

	/** leaving the workspace must not leave a preview compiling in the server */
	dispose(): void {
		this.detach();
	}

	/** the Problems lane switched away from Typst; drop the accumulated LSP view */
	clearLiveDiags(): void {
		this.liveDiags.clear();
	}

	syncToLine(line1: number): void {
		if (this.syncUnavailable()) return;
		const file = this.hooks.getDocPath();
		const cm = sourceCmView.current;
		if (!file || !cm) return;
		const l = cm.state.doc.line(Math.min(Math.max(line1, 1), cm.state.doc.lines));
		const character = l.text.replace(/\s+$/, '').length;
		if (this.task) void scrollTypstPreview(workspaceRoot.current, this.task, file, l.number - 1, character);
	}

	// With Preview on, Compile never shell-runs, so the log watcher that normally fills the
	// Problems panel has nothing to parse - yet the errors exist, live, as tinymist's LSP
	// diagnostics (the same compiler the preview renders with). Feed the panel from those. They
	// arrive per FILE and clear per file (an empty list), so a map accumulates the project view.
	private readonly liveDiags = new Map<string, TypstDiagnostic[]>();

	private publishProblems(): void {
		compileLog.current = typstProblemsLog(this.liveDiags);
	}

	// tinymist can deliver ONE preview click through two channels (the scrollSource notification
	// and the showDocument request); without this the second delivery found the guest's claim
	// already consumed and jumped the HOST's editor too. Harmless for the host's own clicks, so
	// this only needs to be approximate.
	private lastPreviewJump = { key: '', at: 0 };

	// tinymist DIED under a running preview (crash, external kill - own stops never fire this).
	// The task and its port died with it, so drop the address without the kill round trip; the
	// demand effect sees the null host and starts a fresh task while the pane is still wanted.
	// Acts only on a gen INCREASE: the effect also re-runs when the replacement task sets the
	// host, and treating that as a death would kill every fresh task after the first crash.
	private seenServerGen = 0;

	private attachEffects(): void {
		$effect(() => {
			const gen = typstServerGen.current;
			if (gen === this.seenServerGen) return;
			this.seenServerGen = gen;
			// a server that could not start is also tried again this way, once tinymist is installed
			this.tinymistMissing = false;
			if (this.host === null) return;
			this.sendCaretScroll.cancel();
			this.attachedFile = null;
			this.task = null;
			this.host = null;
		});

		// Click-to-jump out of the preview. The framed page cannot reach us - different origin, on
		// purpose - so it reports the clicked span over its own websocket, tinymist resolves it,
		// and the answer arrives as an LSP notification. Same channel tinymist's VS Code extension
		// uses; this is Typst's only route to inverse search, since Typst has no SyncTeX and its
		// PDF carries no source mapping at all.
		$effect(() => {
			if (this.host === null) return;
			setPreviewJumpHandler((jump) => {
				if (!jump?.filepath || !jump.start) return;
				const key = `${jump.filepath}:${jump.start[0]}:${jump.start[1]}`;
				if (key === this.lastPreviewJump.key && Date.now() - this.lastPreviewJump.at < 800) return;
				this.lastPreviewJump = { key, at: Date.now() };
				// A GUEST's preview click: tinymist resolved it, but the resolution belongs to the
				// guest that clicked, not to this editor - hand it back over the session instead.
				const clicker = previewRelay.claimSrcClick();
				if (clicker !== null) {
					const root = workspaceRoot.current;
					const rel = root ? relFromRoot(jump.filepath, root) : '';
					if (rel && rel !== jump.filepath.replace(/\\/g, '/')) {
						collabHost.replyControl({ kind: 'typst-jump', file: rel, line: jump.start[0] }, clicker);
					}
					return;
				}
				// tinymist speaks zero-based LSP positions; the jump helper wants one-based lines
				this.hooks.syncJumpToFileLine(jump.filepath, jump.start[0] + 1, jump.start[1]);
			});
			return () => setPreviewJumpHandler(null);
		});

		// The Preview switch drives the pane, exactly as draftMode does for LaTeX. Attaching is
		// what costs (an executeCommand, then the ~1.2MB renderer), so it happens only once the
		// pane is actually open, and detaching on close frees the server's preview and the wasm
		// session.
		$effect(() => {
			// guests holding the stream keep the task alive with the host's own pane closed; their
			// demand exists only while hosting, so this never starts a task for a lone workspace
			const want = this.wanted && (this.hooks.getPaneOpen() || previewRelay.demand > 0);
			// tracked: switching the main from one .typ to ANOTHER keeps `want` true, so without
			// this the task attached to the old document would run - and stream to guests - forever
			const target = this.hooks.getMainFile();
			if (!want) this.tinymistMissing = false;
			if (want && this.host === null && !this.starting && !this.tinymistMissing) {
				this.starting = true;
				void this.open().finally(() => (this.starting = false));
			} else if (this.host !== null && (!want || target !== this.attachedFile)) {
				// the falling edge, and the retarget: kill the task; the effect re-runs on the host
				// reset and re-attaches onto the current main when still wanted
				this.host = null;
				this.detach();
			}
		});

		// the folders in Preferences moved PATH, so a tinymist that was missing may be there now
		let toolDirs = JSON.stringify(settings.current.toolDirs ?? []);
		$effect(() => {
			const now = JSON.stringify(settings.current.toolDirs ?? []);
			if (now === toolDirs) return;
			toolDirs = now;
			this.tinymistMissing = false;
		});

		// the preview stream's host end
		// the relay dials the data plane, so it needs the task's address (and its disappearance)
		$effect(() => previewRelay.setHost(this.host));
		// the relay found the task's port dead (dials refused): kill it; the demand effect above
		// starts a fresh one for the guests still asking - the same moves as a main-file retarget
		$effect(() => {
			previewRelay.onTaskUnreachable = () => {
				if (this.host === null) return;
				this.host = null;
				this.detach();
			};
			return () => (previewRelay.onTaskUnreachable = null);
		});
		// legs of departed guests close with them
		$effect(() => previewRelay.prune(collabHost.peerIds));
		// guests flip between stream and pushed PDF off this flag (late joiners read it from doc state)
		$effect(() => {
			void collabHost.peerIds; // re-assert per join, belt and braces; the write is change-gated
			if (collabHost.active && !this.hooks.getGuest()) collabHost.advertiseTypstPreview(this.wanted);
		});

		// Deliberately not active outside Preview mode, where the shell compile's parsed log owns
		// the panel and two writers would fight. Diagnostics published before the preview opened
		// are not replayed; the panel fills on the next edit.
		$effect(() => {
			if (!this.wanted) return;
			setTypstDiagnosticsHandler((path, diags) => {
				if (diags.length) this.liveDiags.set(path, diags);
				else this.liveDiags.delete(path);
				this.publishProblems();
			});
			return () => {
				setTypstDiagnosticsHandler(null);
				this.liveDiags.clear();
			};
		});
	}
}
