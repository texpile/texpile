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
import { editorViewStore } from '$lib/stores/editorStore';
import { revealPmComment } from '$lib/editor/visual/extensions/pmComments';
import { flatFiles } from '$lib/workspace/treeRefresh';
import { relativeTo } from '$lib/comments/store.svelte';
import { hasVisualMode, type DocumentBuffer, type FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';

type CommentsDeps = {
	doc: DocumentBuffer;
	modes: ViewModeSwitch;
	kind: () => FileKind;
	guest: () => boolean;
	jumpToFileLine: (abs: string, line: number) => void;
};

export class WorkspaceComments {
	readonly ctl: CommentsController;

	constructor(private d: CommentsDeps) {
		this.ctl = new CommentsController({
			root: () => workspaceRoot.current,
			// a guest has no git repo to fall back to (its root is the 'session' sentinel), but it DOES
			// have the name it joined with - that is what every peer already sees on its cursor
			preferredAuthor: () => userData.current.commentAuthor || (d.guest() ? collabGuest.selfName : ''),
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
			// a guest's events go up to the host, which owns the log; a host's go out to every guest.
			// Solo, both are no-ops and the log is just a file.
			publish: (event) => {
				if (d.guest()) collabGuest.sendComment(event);
				else if (collabHost.active) collabHost.broadcastComment(event);
			}
		});

		// "not in this view" is a statement about the VISUAL view; source draws everything it resolves,
		// so the badge has to disappear in source mode - for the remembered files too, or the panel tells
		// a reader already in source to switch to source
		$effect(() => {
			this.ctl.setVisualMode(d.modes.mode === 'visual');
		});
		$effect(() => {
			// null for a guest: their workspaceRoot is the sentinel 'session', not a path, and the log
			// lives on the host's disk. Comments in a shared session need the session protocol to carry
			// their events; until it does, a guest has no log rather than a broken one.
			//
			// Null in single-file mode too: the root there is only the file's own folder, so the log it
			// points at is some other project's - and writing to it would drop a .texpile beside a file
			// we are visiting, holding threads that project will never see.
			void this.ctl.load(d.guest() || fileMode.current ? null : workspaceRoot.current);
		});
		// A guest has no disk, so its log arrives over the wire: single events as they happen, and the
		// whole thing once on join. load(null) above leaves it empty until then rather than reading a
		// path built from the 'session' sentinel.
		$effect(() => {
			if (!d.guest()) return;
			collabGuest.onCommentEvent = (event) => void this.ctl.ingest(event);
			collabGuest.onCommentLog = (log) =>
				this.ctl.adopt(
					log,
					d.doc.path,
					untrack(() => this.activeText())
				);
			// this guest clicked the streamed preview; the host's tinymist resolved the span and sent
			// the answer back here - the same landing an own-preview click gets on the host
			collabGuest.onTypstJump = (p) => {
				if (!isSafeRel(p.file) || !Number.isFinite(p.line) || p.line < 0) return;
				d.jumpToFileLine(p.file, Math.floor(p.line) + 1);
			};
			return () => {
				collabGuest.onCommentEvent = null;
				collabGuest.onCommentLog = null;
				collabGuest.onTypstJump = null;
			};
		});
		$effect(() => {
			// re-asked on every reconnect: events sent while we were away are only in the host's log
			if (d.guest() && collabGuest.status === 'online') collabGuest.requestComments();
		});
		$effect(() => {
			// keyed on doc.path AND the view mode - NOT on the text, because while the editor is live
			// CodeMirror maps the decorations through each transaction - exactly - and re-searching on
			// top of that could snap a range onto another copy of the quote mid-edit. The mode matters
			// because leaving source unmounts the editor and CM's exactly-mapped ranges go with it, so
			// re-entering must re-search the current text rather than replay the pre-mount list (which
			// after edits can even point past the end of the file).
			void d.modes.mode;
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
