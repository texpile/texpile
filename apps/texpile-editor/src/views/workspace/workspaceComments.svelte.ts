// Review-comments wiring: the controller plus every effect that feeds it (mode changes,
// folder loads, the guest event stream, re-anchoring). The log lives in .texpile/comments.jsonl;
// anchors are re-resolved whenever a file opens or its text is replaced from outside, never
// per keystroke - see the controller.
import { untrack } from 'svelte';
import { CommentsController } from '$lib/workspace/commentsController.svelte';
import { workspaceRoot, fileTree } from '$lib/workspace/workspaceStore';
import { fileMode } from '$lib/workspace/fileMode.svelte';
import { userData } from '$lib/storage/userData';
import { collabGuest } from '$lib/collab/guestStore.svelte';
import { collabHost } from '$lib/collab/hostStore.svelte';
import { isSafeRel } from '$lib/collab/protocol';
import { shareComments } from '$lib/collab/sharedComments';
import { changedSpans } from '$lib/collab/materialize';
import type * as Y from 'yjs';
import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
import { pmCommentsKey, revealPmComment, sourceAnchorFor } from '$lib/editor/visual/extensions/pmComments';
import { liveCommentRanges } from '$lib/editor/visual/extensions/comments';
import { buildAnchor, type CommentAnchor } from '$lib/comments/anchor';
import { flatFiles } from '$lib/workspace/treeRefresh';
import { relativeTo } from '$lib/comments/store.svelte';
import { hasVisualMode, type DocumentBuffer, type FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import type { SourceEdit } from '$lib/workspace/suggestionsController';
import { editOpenFile } from '$lib/workspace/edits/openEditorEdit';
import { onDecisionStep } from '$lib/comments/decisionHistory';
import { markPmDecision } from '$lib/editor/visual/extensions/pmDecisionStep';
import { markCmDecision } from '$lib/editor/source/extensions/cmDecisionStep';
import { editMode, suggesting } from '$lib/comments/activeSuggestions.svelte';
import type { EditMode } from '$lib/comments/suggestCompare';
import { carryClosedEdit } from '$lib/workspace/edits/closedFileEdit';
import { carriedAnchors } from '$lib/workspace/threadPlacement';
import type { TextEdit } from '$lib/workspace/edits/textEdits';

type CommentsDeps = {
	doc: DocumentBuffer;
	modes: ViewModeSwitch;
	kind: () => FileKind;
	guest: () => boolean;
	jumpToFileLine: (abs: string, line: number) => void;
	parseVisual: (text: string) => Promise<ParsedLatexFile | null>;
	flushSave: () => void;
};

export class WorkspaceComments {
	readonly ctl: CommentsController;
	private readonly mode: () => EditMode;

	constructor(private d: CommentsDeps) {
		function mode(): EditMode {
			// a guest suggests only through a host that records it; an older host would take it as editing
			return suggesting.current && !fileMode.current && (!d.guest() || collabGuest.hostRecords) ? 'suggesting' : 'editing';
		}
		this.mode = mode;
		// a guest has no git repo to fall back to (its root is the 'session' sentinel), but it DOES
		// have the name it joined with - that is what every peer already sees on its cursor
		function preferredAuthor(): string {
			return userData.current.commentAuthor || userData.current.collabName || (d.guest() ? collabGuest.selfName : '');
		}
		this.ctl = new CommentsController({
			root: () => workspaceRoot.current,
			preferredAuthor,
			// new anchors and event resolution read the LIVE buffer; the reanchor snapshot goes stale
			// under remote edits in a shared session (see the controller's activeText comment)
			activeText: () => this.activeText(),
			// the mode-preserving jump, not openFileAtLine: revealing a comment from the panel must not
			// yank a visual-mode reader into source - the same courtesy SyncTeX inverse clicks get
			openFileAt: (abs, line) => d.jumpToFileLine(abs, line),
			// Preferred over the line jump while the reader is in visual mode: pmComments has the thread's
			// exact range in the rendered document, so this lands ON the highlight instead of at the top of
			// the block containing it. False whenever that is not available - source/diff mode, a file with
			// no visual editor, a view still mounting, or a thread this view could not place - and
			// openFileAt above takes over unchanged.
			revealInVisual: (id) => {
				if (d.modes.mode !== 'visual' || !hasVisualMode(d.kind())) return false;
				const v = editorViewStore.current;
				return !!v && revealPmComment(v, id);
			},
			liveAnchors: (text) => this.liveAnchors(text),
			mode,
			compares: () => !d.guest(),
			rewraps: () => d.modes.mode === 'visual' && hasVisualMode(d.kind()),
			applyEdit: (edit) => this.applyEdit(edit),
			markDecision: (seq) => this.markDecision(seq),
			saveNow: () => d.flushSave()
		});

		$effect(() => onDecisionStep((s) => void this.ctl.suggestions.revisitAccept(s.seq, s.undone)));

		let lastMode = mode();
		$effect(() => {
			const next = mode();
			const author = preferredAuthor();
			editMode.current = next;
			untrack(() => {
				// a guest's typing so far goes out before its new mode does, so the host records it in the old one
				if (d.guest() && next !== lastMode) d.flushSave();
				if (d.guest()) {
					collabGuest.setSuggesting(next === 'suggesting');
					collabGuest.setAuthor(author);
				} else collabHost.setSuggesting(next === 'suggesting');
			});
			if (next === lastMode) return;
			const was = lastMode;
			lastMode = next;
			untrack(() => void this.ctl.suggestions.settle(was));
		});

		// a guest keeps the others' changes to the open file theirs: named, in their mode, and not
		// compared as this guest's own typing
		$effect(() => {
			if (!d.guest()) return;
			void collabGuest.rev;
			const path = d.doc.path;
			const t = path ? collabGuest.ytextFor(path) : null;
			if (!path || !t) return;
			let running = t.toString();
			const onChange = (ev: Y.YTextEvent) => {
				const before = running;
				running = t.toString();
				const who = collabGuest.remoteAuthorOf(ev.transaction.origin);
				const file = this.ctl.activeFile;
				const root = workspaceRoot.current;
				if (!who || !file || !root || before === running || relativeTo(root, path) !== file) return;
				this.ctl.remoteEdit(file, before, running, { ...who, gestures: changedSpans(ev.delta, before, running) });
			};
			t.observe(onChange);
			return () => t.unobserve(onChange);
		});

		$effect(() => {
			const text = this.activeText();
			const path = d.doc.path;
			untrack(() => this.ctl.suggestions.textChanged(path, text));
		});

		// "not in this view" is a statement about the VISUAL view; source draws everything it resolves,
		// so the badge has to disappear in source mode - for the remembered files too, or the panel tells
		// a reader already in source to switch to source
		$effect(() => {
			this.ctl.setVisualMode(d.modes.mode === 'visual');
		});
		$effect(() => {
			// null for a guest: their workspaceRoot is the sentinel 'session', not a path, and the log
			// they follow is the session's, below.
			//
			// Null in single-file mode too: the root there is only the file's own folder, so the log it
			// points at is some other project's - and writing to it would drop a .texpile beside a file
			// we are visiting, holding threads that project will never see.
			void this.ctl.load(d.guest() || fileMode.current ? null : workspaceRoot.current);
		});
		// in a session the log is a list in the shared doc, which a guest has from the moment it joins;
		// the host puts its own log in first and keeps writing the file
		$effect(() => {
			const guest = d.guest();
			if (guest ? !collabGuest.joined : !collabHost.active) return;
			// untracked: sharing re-reads the threads it rewrites
			return untrack(() => {
				const log = guest ? collabGuest.sharedComments : collabHost.sharedComments;
				return log ? shareComments(this.ctl, log, guest ? 'guest' : 'host') : undefined;
			});
		});
		$effect(() => {
			if (!d.guest()) return;
			// this guest clicked the streamed preview; the host's tinymist resolved the span and sent
			// the answer back here - the same landing an own-preview click gets on the host
			collabGuest.onTypstJump = (p) => {
				if (!isSafeRel(p.file) || !Number.isFinite(p.line) || p.line < 0) return;
				d.jumpToFileLine(p.file, Math.floor(p.line) + 1);
			};
			return () => {
				collabGuest.onTypstJump = null;
			};
		});
		$effect(() => {
			// keyed on doc.path AND the view mode - NOT on the text, because while the editor is live
			// CodeMirror maps the decorations through each transaction - exactly - and re-searching on
			// top of that could snap a range onto another copy of the quote mid-edit. The mode matters
			// because leaving source unmounts the editor and CM's exactly-mapped ranges go with it, so
			// re-entering must re-search the current text rather than replay the pre-mount list (which
			// after edits can even point past the end of the file).
			void d.modes.mode;
			// and on every document the visual editor swaps in: the plugin's mapped ranges go with the
			// old one, and the ranges the new one is placed from must be of the text as it is now
			void d.doc.visualDoc;
			this.ctl.reanchor(
				d.doc.path,
				untrack(() => this.activeText())
			);
		});
	}

	/** the live buffer the anchors resolve against */
	activeText(): string {
		return hasVisualMode(this.d.kind()) ? this.d.doc.texSource : this.d.doc.rawContent;
	}

	private async applyEdit(edit: SourceEdit): Promise<boolean> {
		const before = this.activeText();
		if (edit.from < 0 || edit.to > before.length || edit.to < edit.from) return false;
		const next = before.slice(0, edit.from) + edit.insert + before.slice(edit.to);
		const d = { doc: this.d.doc, mode: () => this.d.modes.mode, kind: this.d.kind, parseVisual: this.d.parseVisual };
		return editOpenFile(d, before, next, edit);
	}

	/** comments and suggestions carried through a change to a file that is not open (a replace across files);
	 *  `made` is the mode an undo or a redo of it goes in */
	editClosedFile(path: string, before: string, after: string, edits: TextEdit[], made?: EditMode): Promise<EditMode> {
		return carryClosedEdit(this.ctl, workspaceRoot.current, made ?? this.mode(), { path, before, after, edits });
	}

	/** the visual editor patches whole paragraphs, so a replace there carries comments by their text */
	async editOpenVisual(before: string, after: string, edits: readonly TextEdit[]): Promise<void> {
		const file = this.ctl.activeFile;
		if (file && this.ctl.store.writable) {
			const by = await this.ctl.author();
			for (const { id, anchor } of carriedAnchors(this.ctl.store.forFile(file), before, after, edits)) {
				const thread = this.ctl.store.threads.find((t) => t.id === id);
				if (thread) await this.ctl.moveAnchor(thread, anchor, file, by);
			}
		}
		this.ctl.reanchor(this.d.doc.path, after);
	}

	private markDecision(seq: number): void {
		if (this.d.modes.mode === 'visual' && hasVisualMode(this.d.kind())) {
			const v = editorViewStore.current;
			if (v) markPmDecision(v, seq);
			return;
		}
		const cm = sourceCmView.current;
		if (cm) markCmDecision(cm, seq);
	}

	async beforeSave(absPath: string, content: string): Promise<void> {
		const root = workspaceRoot.current;
		if (!root || this.d.guest() || fileMode.current) return;
		const file = relativeTo(root, absPath);
		if (file === absPath.replace(/\\/g, '/')) return;
		await this.ctl.suggestions.beforeSave(file, content);
	}

	discarded(absPath: string): void {
		const root = workspaceRoot.current;
		if (root) void this.ctl.suggestions.discardUnsaved(relativeTo(root, absPath));
	}

	async adoptDisk(): Promise<void> {
		const file = this.ctl.activeFile;
		if (file) await this.ctl.suggestions.adoptDisk(file, this.activeText());
		this.reanchorNow();
	}

	/** re-search the open file's threads against its text as it is now; see the reanchor effect */
	reanchorNow(): void {
		this.ctl.reanchor(this.d.doc.path, this.activeText());
	}

	liveAnchors(text: string): Map<string, CommentAnchor> | null {
		const out = new Map<string, CommentAnchor>();
		if (this.d.modes.mode === 'visual' && hasVisualMode(this.d.kind())) {
			const v = editorViewStore.current;
			// the map describes texSource; another text has no map to read
			if (!v || text !== this.d.doc.texSource) return null;
			for (const r of pmCommentsKey.getState(v.state)?.ranges ?? []) {
				if (r.resolved) continue;
				const anchor = sourceAnchorFor(v.state.doc, this.d.doc.sourceMap, text, r.from, r.to);
				if (anchor) out.set(r.id, anchor);
			}
			return out;
		}
		const cm = sourceCmView.current;
		if (!cm || cm.state.doc.toString() !== text) return null;
		for (const r of liveCommentRanges(cm.state)) {
			if (!r.resolved) out.set(r.id, buildAnchor(text, r.from, r.to));
		}
		return out;
	}

	/**
	 * Which files the panel's threads can actually open: threads survive their file's deletion ON
	 * PURPOSE (the log is append-only, and undoing the delete brings them straight back), so the
	 * panel needs to know a thread's file is gone to say so instead of presenting a dead link.
	 * null while no folder is open - "unknown", drawing no badges, rather than "everything missing".
	 */
	get filesPresent(): Set<string> | null {
		const root = workspaceRoot.current;
		if (!root) return null;
		return new Set(flatFiles(fileTree.current).map((p) => relativeTo(root, p)));
	}
}
