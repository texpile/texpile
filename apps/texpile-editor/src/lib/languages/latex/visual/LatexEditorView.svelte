<script lang="ts">
	import ContextMenu from '$lib/editor/visual/contextMenu/ContextMenu.svelte';
	import type { ShowInOutput } from '$lib/editor/visual/contextMenu/showInOutput';
	import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { EditorState, Transaction } from 'prosemirror-state';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { schema } from '$lib/languages/latex/schema/latexPMSchema';
	import { latexEditorPlugins } from './latexEditorSetup';
	import { latexNodeViews } from './latexNodeViews';
	import { documentMainFile } from '$lib/workspace/workspaceStore';
	import { samePath } from '$lib/workspace/fileSystem';
	import { loadMathlive, mathliveLoaded, type MathlivePlugin } from '$lib/languages/mathliveLoad';
	import { swapParsedDoc, swapDocForNewFile, docSwapKind } from '$lib/editor/visual/docSwap';
	import { referenceStore } from '$lib/stores/editorStore';
	import { deckPreamble } from './core/title/deckPreamble.svelte';
	import { groupView } from '$lib/editor/visual/groupView.svelte';
	import { preferences } from '$lib/stores/preferencesStore.svelte';
	import { padTablesInState } from '$lib/editor/visual/padTables';
	import { createCanvasView } from '$lib/editor/canvas';
	import { canvasMount } from '$lib/editor/visual/mount/canvasMount.svelte';
	import '$lib/editor/canvas/frame/canvasRoot.css';
	import { syncPmComments } from '$lib/editor/visual/extensions/pmCommentsSync.svelte';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
	import type { CommentRange } from '$lib/editor/visual/extensions/comments';
	import type { RegionParser, SourceMap } from '$lib/editor/visual/sourceSpans';
	import type { BiblatexReference } from '$lib/languages/bib/biblatex';

	type Props = {
		/** false in a parked editor group: no typing, and it follows the focused editor on the same file */
		live?: boolean;
		// the document as a ProseMirror Node
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		/** any caret/selection movement (shared-session presence publishes through this). */
		onSelectionChange?: () => void;
		// references for @ citation suggestions
		localReferences?: BiblatexReference[];
		docPath?: string | null;
		// where inserted images go (an images/ subfolder)
		imageDir?: string;
		placeholder?: string;
		/** after the view's first painted frame with its fonts and formulas, and again for each file swapped in.
		 * The build starts only after the dynamic import below resolves, so callers cannot infer it from mounting */
		onReady?: () => void;
		/** the file's threads as ranges of its text, placed here through the map */
		commentRanges?: CommentRange[];
		sourceMap?: SourceMap;
		/** the file's text, the stretch of it the document is, and its parser: what suggestions are drawn from */
		texSource?: string;
		bodyRange?: { from: number; to: number };
		regionParser?: RegionParser | null;
		/** the selection as a range of the file; see pmComments */
		sourceAnchor?: SourceAnchorFn;
		/** the thread the reader is looking at, highlighted stronger than the rest */
		selectedComment?: string | null;
		/** commented text was clicked. Origin 'visual': unlike source mode's prose clicks, this one
		 * OPENS the panel - the visual editor has no gutter rail, so the highlight is the only
		 * affordance pointing at the thread, and select-only left no way in at all. */
		onSelectComment?: (id: string) => void;
		/** the reader asked to comment on a selection; the anchor is a range of the file (sourceAnchor) */
		onAddComment?: (anchor: CommentAnchor | null) => void;
		/** pick citations from Zotero, offered in the context menu when present */
		onInsertCitation?: () => void;
		/** cite by DOI or arXiv ID, offered in the context menu when present */
		onCiteByDoi?: () => void;
		/** Show in PDF from the right-click menu */
		showInOutput?: ShowInOutput;
		/** the language this file's spelling is checked in; null checks nothing */
		spellLanguage?: SpellLanguage | null;
		/** a \ref whose label is not drawn here: the workspace jumps to its \label line */
		onJumpToLabel?: (name: string) => boolean;
		/** a drawn call of the paper's own macro: the workspace opens its definition in the source */
		onJumpToDefinition?: (name: string) => boolean;
		/** after each placement pass: the threads that could not be drawn in this view (every tier
		 * failed), so the panel can say "not in this view" instead of implying they are gone */
		onCommentsPlaced?: (lost: string[]) => void;
		/** a composer is open for a selection here; false clears the pending selection tint */
		commentPendingActive?: boolean;
		/** pill label, translated by the caller */
		addCommentLabel?: string;
	};

	let {
		live = true,
		localValue = null,
		onLocalChange,
		onSelectionChange,
		localReferences = [],
		docPath = null,
		imageDir,
		placeholder = 'Begin your journey here...',
		onReady,
		commentRanges = [],
		sourceMap = { leaves: [], blocks: [] },
		texSource = '',
		bodyRange = { from: 0, to: 0 },
		regionParser = null,
		sourceAnchor,
		selectedComment = null,
		onSelectComment,
		onAddComment,
		onInsertCitation,
		onCiteByDoi,
		showInOutput,
		spellLanguage = 'en',
		onJumpToLabel,
		onJumpToDefinition,
		onCommentsPlaced,
		addCommentLabel = 'Comment',
		commentPendingActive = false
	}: Props = $props();

	// an editor group's props arrive spread, so a read of one tracks all of them; only a new list is published
	const incomingReferences = $derived(localReferences);
	$effect(() => {
		referenceStore.current = incomingReferences;
	});

	$effect(() => {
		if (live) deckPreamble.current = texSource.slice(0, bodyRange.from);
	});

	let editor: HTMLElement | null = $state(null);
	let editorView: EditorView | null = $state(null);
	const group = groupView({ view: () => editorView, live: () => live, path: () => docPath ?? null });
	function isMainFile(): boolean {
		const main = documentMainFile();
		return !main || !docPath || samePath(main, docPath);
	}
	const mount = canvasMount({
		view: () => editorView,
		path: () => docPath ?? null,
		imageDirectory: () => imageDir ?? '',
		cropFormat: 'latex',
		isMainFile,
		onReady: () => onReady?.()
	});
	const isLive = $derived(live);
	let editorState: EditorState | null = $state(null);

	onMount(() => {
		const mathlive = mathliveLoaded();
		if (mathlive) build(mathlive);
		else void loadMathlive().then(build);
	});

	function build({ mathlivePlugin, mlarrowHandlers }: MathlivePlugin): void {
		if (!editor) return;

		const plugins = latexEditorPlugins({
			mathlivePlugin,
			mlarrowHandlers,
			imageDir: imageDir === undefined ? undefined : () => imageDir ?? '',
			placeholder,
			onSelectComment,
			onAddComment,
			sourceAnchor,
			addCommentLabel,
			spellLanguage: () => spellLanguage,
			jumpToDefinition: (name) => void onJumpToDefinition?.(name),
			isMainFile,
			filePath: () => docPath ?? null
		});

		const initialDoc = localValue ?? undefined;

		editorState = EditorState.create({
			schema,
			plugins,
			doc: initialDoc
		});
		editorState = padTablesInState(editorState);

		function dispatchTransaction(this: EditorView, transaction: Transaction): void {
			// the spellchecker can finish into a view a tab switch destroyed: what it carries is for a document nobody sees
			if (this.isDestroyed) return;
			const newState = this.state.apply(transaction);
			this.updateState(newState);

			// collabRemotePatch: a collaborator's edit patched in from the shared doc; it's already
			// the serialized truth, so it must not re-enter the save pipeline as a local change
			if (onLocalChange && transaction.docChanged && !transaction.getMeta('collabRemotePatch')) {
				onLocalChange(newState.doc);
			}
			if (transaction.getMeta('collabRemotePatch')) remotePatches++;
			if (onSelectionChange && (transaction.selectionSet || transaction.docChanged)) onSelectionChange();
		}

		editorView = createCanvasView(
			editor,
			{
				// headings and figures show their numbers from numbersPlugin
				attributes: () => ({
					class: untrack(() => preferences.pageView) ? 'TexpileEditor page-view' : 'TexpileEditor',
					spellcheck: 'false',
					'data-compiled-numbers': 'true'
				}),
				state: editorState,
				language: 'latex',
				...latexNodeViews({ imageDir: () => imageDir ?? '', onJumpToLabel, onJumpToDefinition }),
				editable: group.editable,
				dispatchTransaction
			},
			mount.setup(editor)
		);

		group.claim(editorView);
		if (live) editorView.focus();
	}

	let mountedDoc: PMNode | null = null;
	let mountedPath: string | null = null;
	let wasHeld = false;
	// its own effect: the swap below must not run again for a change of focus alone
	$effect(() => {
		if (!live) wasHeld = true;
		else queueMicrotask(() => (wasHeld = false));
	});
	/** bumped when a doc SWAP lands - the one moment plugin state was rebuilt and comment ranges
	 * with it. Typing never bumps it: ranges map through transactions and re-searching mid-edit
	 * could snap a range onto another copy of its text. */
	let docEpoch = $state(0);
	let remotePatches = $state(0);
	// an editor group's props arrive spread, so a read of one tracks all of them; only a new document may swap
	const incomingDoc = $derived(localValue);
	const incomingPath = $derived(docPath);
	$effect(() => {
		const next = incomingDoc;
		const path = incomingPath;
		if (!editorView || !next) return;
		if (mountedDoc === null) {
			// initial doc was installed at construction, just remember it
			mountedDoc = next;
			mountedPath = path;
			return;
		}
		// a document held still while this one was parsed: it takes the keyboard the way a fresh build does
		const takesFocus = wasHeld && untrack(() => live);
		const kind = docSwapKind(next, editorView.state.doc, path, mountedPath);
		mountedDoc = next;
		mountedPath = path;
		if (kind === 'none') return;
		if (kind === 'newFile') swapDocForNewFile(editorView, schema, next);
		else swapParsedDoc(editorView, schema, next);
		docEpoch++;
		if (kind === 'newFile') {
			mount.swappedFile(editorView);
			if (takesFocus) editorView.focus();
		}
	});

	// Declared AFTER the swap effect on purpose: effects run in declaration order, so by the time
	// the sync reads editorView.state.doc the swap has already installed the new document.
	syncPmComments({
		view: () => editorView,
		live: () => isLive,
		ranges: () => commentRanges,
		map: () => sourceMap,
		text: () => texSource,
		body: () => bodyRange,
		parse: () => regionParser,
		epoch: () => docEpoch,
		patched: () => remotePatches,
		selected: () => selectedComment,
		onPlaced: (lost) => onCommentsPlaced?.(lost),
		pendingActive: () => commentPendingActive
	});

	// page view is a class on the root and its style mirror, which the attributes prop puts on both
	$effect(() => {
		void preferences.pageView;
		const view = editorView;
		if (view) untrack(() => view.setProps({}));
	});

	onDestroy(() => {
		editorView?.destroy();
		group.release(editorView);
		// don't clear referenceStore here, the workspace owns it; clearing blanked citations
		// in source mode and across editor remounts
	});
</script>

<main bind:this={editor}></main>

<ContextMenu {onAddComment} {sourceAnchor} {onInsertCitation} {onCiteByDoi} {showInOutput} />

<style lang="postcss">
	@reference "../../../../app.css";

	:global(.agent-diff-insert) {
		background-color: color-mix(in srgb, var(--diff-insert-tint) 2%, transparent);
		outline: 2px solid color-mix(in srgb, var(--diff-insert-tint) 4%, transparent);
		outline-offset: -1px;
	}
	:global(.agent-diff-delete) {
		background-color: color-mix(in srgb, var(--diff-delete-tint) 15%, transparent);
		text-decoration: line-through;
		color: color-mix(in srgb, var(--diff-delete-tint) 8%, transparent);
		opacity: 0.7;
	}

	:global(.agent-highlight) {
		background-color: color-mix(in srgb, var(--diff-highlight-tint) 35%, transparent);
		outline: var(--default-border-width) solid color-mix(in srgb, var(--diff-highlight-tint) 6%, transparent);
		outline-offset: -1px;
		border-radius: calc(var(--radius-base) * 0.5);
	}
	:global(.dark .agent-highlight) {
		background-color: color-mix(in srgb, var(--diff-highlight-tint) 25%, transparent);
		outline: var(--default-border-width) solid color-mix(in srgb, var(--diff-highlight-tint) 4%, transparent);
	}
</style>
