<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { EditorView, type ViewUpdate } from '@codemirror/view';
	import { EditorState, Compartment } from '@codemirror/state';
	import { setCommentRanges, focusCommentThread, type CommentRange } from '$lib/editor/visual/extensions/comments';
	import { flashLineEffect } from '$lib/languages/latex/source/synctexFlash';
	import { bindModalKeymap, modalKeymapCompartment } from '$lib/editor/source/extensions/keybindings/modalKeymap';
	import { typstServerGen } from '$lib/languages/typst/intellisense/lspClient';
	import { sourceCmView } from '$lib/stores/editorStore';
	import { docText } from '$lib/editor/source/docText';
	import { setSourceDocCount, setSourceSelectionCount } from '$lib/stores/countStore.svelte';
	import { trailingDebounce } from '$lib/trailingDebounce';
	import { settings } from '$lib/settings';
	import * as Y from 'yjs';
	import type { SourceDiagnostic, CollabBinding } from './sourceEditorTypes';
	import { buildSourceExtensions, applySourceLanguage } from './sourceEditorSetup';
	import { SourcePositionMemory, restorePoint, reapplyScrollOffset, applyModeSwitchAnchor } from './sourcePositionMemory';
	import { SourceValueSync } from './sourceValueSync';
	import { SourceDiagnosticsFeed } from './sourceDiagnosticsFeed';
	import { resolveGotoTarget } from './sourceGotoTarget';
	import { TypstLspBinding } from './typstLspBinding';
	import SourceRightClickMenu from '$lib/editor/source/SourceRightClickMenu.svelte';

	// gotoLine: token makes repeat jumps to the same line re-fire; selectText anchors against line drift.
	// initialScrollPos: one-shot mode-switch sync applied at mount.
	// onHistoryBoundary: called when CM undo/redo is exhausted; return true if the workspace history handled it.
	let {
		value = '',
		onInput,
		filename = '',
		docPath = null,
		gotoLine,
		onSyncToPdf,
		initialScrollPos = null,
		onHistoryBoundary,
		diagnostics = [],
		onJumpToFile,
		onOpenFileAt,
		collab = null,
		onCaretMove,
		commentRanges = [],
		selectedComment = null,
		onAddComment,
		onInsertCitation,
		onInsertLibraryCitation,
		onSelectComment
	}: {
		value?: string;
		onInput?: (v: string) => void;
		filename?: string;
		/** absolute path, for remembering this file's caret across tab switches */
		docPath?: string | null;
		gotoLine?: { line: number; token: number; selectText?: string };
		onSyncToPdf?: (line: number) => void;
		initialScrollPos?: { scroll: number | null; cursor: number | null } | null;
		onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
		diagnostics?: SourceDiagnostic[];
		/** go-to-definition hooks: \input targets and cross-file definition jumps */
		onJumpToFile?: (name: string) => void;
		onOpenFileAt?: (file: string, line: number) => void;
		collab?: CollabBinding | null;
		/** ZERO-based line and column; fires on column moves too, because tinymist's jump_from_cursor
		 *  reads the leaf BEFORE the cursor and never resolves at column 0. consumers debounce. */
		onCaretMove?: (line: number, character: number) => void;
		/** review-comment ranges already resolved against this text; see lib/comments */
		commentRanges?: CommentRange[];
		/** the thread the reader is looking at; its highlight is picked out from the rest */
		selectedComment?: string | null;
		/** the reader selected text and pressed Comment; offsets are into this document */
		onAddComment?: (from: number, to: number) => void;
		/** pick citations from Zotero and insert them at the caret (host + desktop only) */
		onInsertCitation?: () => void;
		/** pick citations from the personal library and insert them at the caret (host + desktop only) */
		onInsertLibraryCitation?: () => void;
		onSelectComment?: (id: string, from: 'text' | 'gutter') => void;
	} = $props();

	/** last position reported to onCaretMove, so redundant selection updates do not spray requests */
	let lastCaretLine = -1;
	let lastCaretChar = -1;

	// language/extension gating: EditorPane only passes docPath, so `filename` alone was always
	// '' and EVERY file (md, bib) silently fell into the "no name -> assume LaTeX" branch —
	// latex intellisense shortcuts and highlighting in markdown source mode included
	const fileFor = $derived(filename || docPath || '');
	const isTypFile = $derived(/\.typ$/i.test(fileFor));

	let rightClick: { open: (event: MouseEvent, on: EditorView) => void } | undefined;

	let host = $state<HTMLDivElement>();
	let view: EditorView | null = null;
	const langConf = new Compartment();
	const roConf = new Compartment();
	// soft wrap is a compartment, not a mounted-once extension: toggling it in Preferences has to
	// take effect in the editor already on screen, and remounting would lose the caret and scroll
	const wrapConf = new Compartment();
	// a compartment, so the editor mounts and is typeable before the server answers, or never does
	const lspConf = new Compartment();
	// vim / emacs bindings, filled in after mount because the packages are dynamically imported
	const keymapConf = modalKeymapCompartment();
	let unbindKeymap: (() => void) | null = null;

	const sync = new SourceValueSync();
	const positions = new SourcePositionMemory();
	const diagFeed = new SourceDiagnosticsFeed();
	const lsp = new TypstLspBinding(() => view, lspConf);

	const deferredDocCount = trailingDebounce(300, setSourceDocCount);
	// throttle-ish: scrolling and arrow keys fire constantly, and only the resting place matters
	const deferredRememberPosition = trailingDebounce<void>(400, () => positions.remember(view, docPath, !!collab));
	// reads the selection at fire time (not capture), so a huge selection isn't sliced per keystroke
	const deferredSelectionCount = trailingDebounce<void>(150, () => {
		if (!view) return;
		const s = view.state.selection.main;
		setSourceSelectionCount(s.empty ? null : view.state.sliceDoc(s.from, s.to));
	});
	// held at component scope so onDestroy can tear it down (else its doc observer leaks across
	// every file switch / mode toggle that remounts this editor)
	let undoManager: Y.UndoManager | null = null;

	function onViewUpdate(u: ViewUpdate): void {
		if (u.docChanged) {
			const text = docText(u.state.doc);
			if (!sync.syncing) {
				sync.lastEmitted = text;
				onInput?.(text);
			}
			deferredDocCount(text); // word/char count is display-only, off the keystroke path
		}
		if (u.docChanged || u.selectionSet) deferredSelectionCount();
		if (u.selectionSet && onCaretMove) {
			const head = u.state.selection.main.head;
			const docLine = u.state.doc.lineAt(head);
			const line = docLine.number - 1;
			// UTF-16 code units from the line start, which is what LSP positions want
			// and what CodeMirror's offsets already are
			const character = head - docLine.from;
			if (line !== lastCaretLine || character !== lastCaretChar) {
				lastCaretLine = line;
				lastCaretChar = character;
				onCaretMove(line, character);
			}
		}
		if (u.selectionSet || u.docChanged || u.geometryChanged) deferredRememberPosition();
	}

	onMount(() => {
		// collab mode: the Y.Text is the document, CRDT undo replaces CM history (plain CM undo
		// would revert other people's edits)
		undoManager = collab ? new Y.UndoManager(collab.ytext) : null;
		const initialDoc = collab ? collab.ytext.toString() : value;
		// folded into EditorState.create, not dispatched after mount, so the first paint is already
		// in the right place
		const { restored, offset } = restorePoint(docPath, !!collab, initialScrollPos != null, initialDoc);
		view = new EditorView({
			parent: host,
			...(restored ? { scrollTo: EditorView.scrollIntoView(restored.scroll, { y: 'start', yMargin: 0 }) } : {}),
			state: EditorState.create({
				doc: initialDoc,
				...(restored ? { selection: { anchor: restored.cursor } } : {}),
				extensions: buildSourceExtensions({
					fileFor,
					collab,
					undoManager,
					langConf,
					roConf,
					wrapConf,
					lspConf,
					keymapConf,
					lineWrap: settings.current.sourceLineWrap !== false,
					onAddComment,
					onSelectComment,
					onJumpToFile,
					onOpenFileAt,
					onHistoryBoundary,
					onScroll: () => deferredRememberPosition(),
					updateListener: onViewUpdate
				})
			})
		});
		window.texpile.debug.codemirror = view;
		view.focus();
		if (restored && offset) reapplyScrollOffset(() => view, restored.scroll, offset);
		unbindKeymap = bindModalKeymap(view, keymapConf);
		// collab mount: the Y.Text may be ahead of the caller's value (guest edits landed while
		// the file was closed) — hand the truth back so the save pipeline starts aligned
		if (collab && onInput && collab.ytext.toString() !== value) onInput(collab.ytext.toString());
		// seed the counts now; the updateListener only fires on later changes
		setSourceDocCount(docText(view.state.doc));
		setSourceSelectionCount(null);
		if (initialScrollPos != null) applyModeSwitchAnchor(view, initialScrollPos);
		// publish this CM as the source-mode editor so menuBarCommands can route Insert/Format to it
		sourceCmView.current = view;
		applySourceLanguage(() => view, fileFor, langConf);
		// never awaited: a missing or slow tinymist must not delay the editor appearing. started by
		// the FILE, not the compile command, so a Makefile-driven Typst project still gets intellisense
		lsp.arm(fileFor);
	});

	$effect(() => {
		lsp.onServerGen(typstServerGen.current, fileFor);
	});

	// follow the Preferences toggle in the open editor rather than only at mount
	$effect(() => {
		const wrap = settings.current.sourceLineWrap !== false;
		view?.dispatch({ effects: wrapConf.reconfigure(wrap ? EditorView.lineWrapping : []) });
	});

	// collab mode: the Y.Text is the document, external value pushes would fight the CRDT
	$effect(() => {
		const v = value;
		if (!collab && view) sync.pushExternal(view, v);
	});

	// live read-only flips (the host opened/closed this file in its visual editor)
	$effect(() => {
		const ro = collab?.readOnly ?? false;
		void ro;
		if (view && collab) {
			view.dispatch({ effects: roConf.reconfigure(ro ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []) });
		}
	});

	// declared after the value-sync effect, so a same-flush file switch replaces the document first.
	// dispatched on identity change only: CM maps the ranges itself, and re-dispatching discards that
	let lastRanges: CommentRange[] | null = null;
	$effect(() => {
		const list = commentRanges;
		const v = view;
		if (!v || !onAddComment || list === lastRanges) return;
		lastRanges = list;
		// a list that does not fit was resolved against some other text and stays wrong for this doc
		// forever; consumed but not dispatched, so the field keeps what CM has been mapping
		if (list.some((r) => r.from < 0 || r.to > v.state.doc.length)) return;
		v.dispatch({ effects: setCommentRanges.of(list) });
	});

	// kept apart from the ranges: selecting happens far more often and must not rebuild the whole set
	let lastFocus: string | null = null;
	$effect(() => {
		const id = selectedComment ?? null;
		const v = view;
		if (!v || !onAddComment || id === lastFocus) return;
		lastFocus = id;
		v.dispatch({ effects: focusCommentThread.of(id) });
	});

	// the effect still runs per keystroke (value is a dependency), but the feed skips dispatches
	// that cannot change anything
	$effect(() => {
		const list = diagnostics;
		const v = view;
		void value; // re-anchor when the document is externally replaced
		if (!v) return;
		// setDiagnostics REPLACES the whole lint state, so with a server attached the two writers
		// would overwrite each other. the server owns the squiggles; the compile log keeps Problems
		if (lsp.ownsDiagnostics) return;
		diagFeed.apply(v, list);
	});

	// the token has to be CHECKED, not just carried: the prop arrives inside an inline object
	// literal, so a save or a compile re-runs this effect and would re-apply the last jump
	let lastGotoToken: number | null = null;
	$effect(() => {
		const req = gotoLine;
		if (!req || !view) return;
		if (req.token === lastGotoToken) return;
		lastGotoToken = req.token;
		const { from, to } = resolveGotoTarget(view.state.doc, req);
		view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true, effects: flashLineEffect.of(from) });
		view.focus();
	});

	onDestroy(() => {
		// this teardown IS the tab switch: last chance to record where the user was, and the
		// debounce below is about to be cancelled, so take the snapshot synchronously first
		positions.remember(view, docPath, !!collab);
		sourceCmView.current = null;
		lsp.release();
		unbindKeymap?.();
		unbindKeymap = null;
		// collab teardown: drop our cursor from awareness so peers don't see a ghost, and reap the
		// undo manager's doc observer before the view goes
		if (collab) collab.awareness.setLocalStateField('cursor', null);
		undoManager?.clear();
		undoManager?.destroy();
		undoManager = null;
		view?.destroy();
		view = null;
		// stale timers must not write the NEXT file's counts into the shared store
		deferredDocCount.cancel();
		deferredSelectionCount.cancel();
		deferredRememberPosition.cancel();
	});
</script>

<div bind:this={host} class="source-editor h-full" oncontextmenu={(e) => view && rightClick?.open(e, view)} role="presentation"></div>

<SourceRightClickMenu
	bind:this={rightClick}
	{onSyncToPdf}
	{onAddComment}
	{onInsertCitation}
	{onInsertLibraryCitation}
	syncTarget={isTypFile ? 'preview' : 'pdf'}
/>

<style>
	.source-editor :global(.cm-editor) {
		height: 100%;
		font-size: 0.875rem;
		position: relative; /* anchor the floating top-right search panel */
	}
	/* float texpileSearch's panel top-right as the same card the visual editor's find bar uses
	   (SearchBar.svelte), so the two search UIs stay consistent */
	.source-editor :global(.cm-panels.cm-panels-top) {
		position: absolute;
		top: 0.5rem;
		right: 0.75rem;
		left: auto;
		width: max-content;
		max-width: calc(100% - 1.5rem);
		background: var(--color-surface-50);
		border: 1px solid var(--color-surface-200);
		border-radius: var(--radius-container, 0.75rem);
		box-shadow:
			0 20px 25px -5px rgb(0 0 0 / 0.1),
			0 8px 10px -6px rgb(0 0 0 / 0.1);
		z-index: 20;
		overflow: hidden;
	}
	:global([data-mode='dark'] .source-editor .cm-panels.cm-panels-top) {
		background: var(--color-surface-950);
		border-color: var(--color-surface-800);
	}
	/* same amber scale the ProseMirror search uses (SearchBar.svelte) */
	.source-editor :global(.cm-searchMatch) {
		background-color: rgb(255, 237, 153);
	}
	.source-editor :global(.cm-searchMatch-selected) {
		background-color: rgb(255, 213, 79);
	}
	:global([data-mode='dark'] .source-editor .cm-searchMatch) {
		background-color: rgb(102, 77, 3);
	}
	:global([data-mode='dark'] .source-editor .cm-searchMatch-selected) {
		background-color: rgb(161, 123, 5);
	}
	.source-editor :global(.cm-scroller) {
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		line-height: 1.6;
	}
	.source-editor :global(.cm-content) {
		padding: 1rem 0;
	}
	.source-editor :global(.cm-focused) {
		outline: none;
	}
	/* vim / emacs mode line. Unlike the search widget above this is a BOTTOM panel, so it keeps
	   CodeMirror's normal in-flow layout (the scroller shrinks for it) and only needs skinning. */
	.source-editor :global(.cm-panels.cm-panels-bottom) {
		border-top: 1px solid var(--color-surface-200);
		background: var(--color-surface-100);
	}
	:global([data-mode='dark'] .source-editor .cm-panels.cm-panels-bottom) {
		border-top-color: var(--color-surface-800);
		background: var(--color-surface-900);
	}
	.source-editor :global(.cm-vim-panel) {
		font-size: 0.75rem;
		align-items: center;
		min-height: 1.6em;
	}
</style>
