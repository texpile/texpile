<script lang="ts">
	// The markdown visual editor: its OWN ProseMirror over mdSchema, fully separate from the tex
	// EditorView. Extensions are shared where they are schema-agnostic (they read state.schema);
	// everything LaTeX-flavored (intellisense, citations, template views, latex clipboard,
	// suggestion mode, the block-handle insert menu) is deliberately absent.
	import { onDestroy, onMount, untrack } from 'svelte';
	import { loadMathlive, mathliveLoaded, type MathlivePlugin } from '$lib/languages/mathliveLoad';
	import { EditorState, type Transaction } from 'prosemirror-state';
	import { swapParsedDoc, swapDocForNewFile, docSwapKind } from '$lib/editor/visual/docSwap';
	import type { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { padTablesInState } from '$lib/editor/visual/padTables';
	import { createCanvasView } from '$lib/editor/canvas';
	import { canvasMount } from '$lib/editor/visual/mount/canvasMount.svelte';
	import { mdSchema } from './schema';
	import { markdownEditorPlugins } from './markdownEditorSetup';
	import { markdownNodeViews } from './markdownNodeViews';
	import { referenceStore } from '$lib/stores/editorStore';
	import { groupView } from '$lib/editor/visual/groupView.svelte';
	import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
	import ContextMenu from '$lib/editor/visual/contextMenu/ContextMenu.svelte';
	import { syncPmComments } from '$lib/editor/visual/extensions/pmCommentsSync.svelte';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
	import type { CommentRange } from '$lib/editor/visual/extensions/comments';
	import type { RegionParser, SourceMap } from '$lib/editor/visual/sourceSpans';
	import type { BiblatexReference } from '$lib/languages/bib/biblatex';
	import '$lib/editor/canvas/frame/canvasRoot.css';

	type Props = {
		/** false in a parked editor group: no typing, and it follows the focused editor on the same file */
		live?: boolean;
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		onSelectionChange?: () => void;
		localReferences?: BiblatexReference[];
		imageDir?: string;
		docPath?: string | null;
		/** the language this file's spelling is checked in; null checks nothing */
		spellLanguage?: SpellLanguage | null;
		placeholder?: string;
		onReady?: () => void;
		/** the link tooltip's Open action: return true when handled in-app (workspace-relative
		 * markdown link), false to fall through to the browser. */
		onOpenLink?: (href: string) => boolean;
		/** review comments, same contract as the latex EditorView; see extensions/pmComments */
		commentRanges?: CommentRange[];
		sourceMap?: SourceMap;
		/** the file's text, the stretch of it the document is, and its parser: what suggestions are drawn from */
		texSource?: string;
		bodyRange?: { from: number; to: number };
		regionParser?: RegionParser | null;
		/** the selection as a range of the file; see pmComments */
		sourceAnchor?: SourceAnchorFn;
		selectedComment?: string | null;
		onSelectComment?: (id: string) => void;
		onAddComment?: (anchor: CommentAnchor | null) => void;
		onCommentsPlaced?: (lost: string[]) => void;
		addCommentLabel?: string;
		/** a composer is open for a selection here; false clears the pending selection tint */
		commentPendingActive?: boolean;
	};

	let {
		live = true,
		localValue = null,
		onLocalChange,
		onSelectionChange,
		localReferences = [],
		imageDir,
		docPath = null,
		spellLanguage = 'en',
		placeholder = '',
		onReady,
		onOpenLink,
		commentRanges = [],
		sourceMap = { leaves: [], blocks: [] },
		texSource = '',
		bodyRange = { from: 0, to: 0 },
		regionParser = null,
		sourceAnchor,
		selectedComment = null,
		onSelectComment,
		onAddComment,
		onCommentsPlaced,
		addCommentLabel = 'Comment',
		commentPendingActive = false
	}: Props = $props();

	$effect(() => {
		referenceStore.current = localReferences;
	});

	let editor: HTMLElement = $state(null!);
	let editorView: EditorView | null = $state(null);
	const group = groupView({ view: () => editorView, live: () => live, path: () => docPath ?? null });
	const isLive = $derived(live);

	const mount = canvasMount({
		view: () => editorView,
		path: () => docPath ?? null,
		imageDirectory: () => imageDir ?? '',
		cropFormat: '',
		isMainFile: () => true,
		onReady: () => onReady?.()
	});

	onMount(() => {
		const mathlive = mathliveLoaded();
		if (mathlive) build(mathlive);
		else void loadMathlive().then(build);
	});

	function build({ mathlivePlugin, mlarrowHandlers }: MathlivePlugin): void {
		if (!editor) return;

		const plugins = markdownEditorPlugins({
			mathlivePlugin,
			mlarrowHandlers,
			imageDir: imageDir === undefined ? undefined : () => imageDir ?? '',
			placeholder,
			onOpenLink,
			onSelectComment,
			onAddComment,
			sourceAnchor,
			addCommentLabel,
			spellLanguage: () => spellLanguage
		});

		let editorState = EditorState.create({ schema: mdSchema, plugins, doc: localValue ?? undefined });
		editorState = padTablesInState(editorState);

		editorView = createCanvasView(
			editor,
			{
				attributes: { class: 'TexpileEditor MarkdownEditor', spellcheck: 'false' },
				state: editorState,
				language: 'markdown',
				...markdownNodeViews(),
				editable: group.editable,
				dispatchTransaction(this: EditorView, transaction: Transaction) {
					// async plugins (spellcheck) can dispatch into a destroyed view on tab switches
					if (this.isDestroyed) return;
					const newState = this.state.apply(transaction);
					this.updateState(newState);
					// collabRemotePatch: a collaborator's edit patched in from the shared doc. It is
					// already IN the shared doc, so reporting it as a local change would echo it back
					// out and the two peers would ping-pong the same edit
					if (onLocalChange && transaction.docChanged && !transaction.getMeta('collabRemotePatch')) onLocalChange(newState.doc);
					if (transaction.getMeta('collabRemotePatch')) remotePatches++;
					if (onSelectionChange && (transaction.selectionSet || transaction.docChanged)) onSelectionChange();
				}
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
	/** bumped only on doc SWAPS (see pmCommentsSync); typing maps ranges instead */
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
		if (kind === 'newFile') swapDocForNewFile(editorView, mdSchema, next);
		else swapParsedDoc(editorView, mdSchema, next);
		docEpoch++;
		if (kind === 'newFile') {
			mount.swappedFile(editorView);
			if (takesFocus) editorView.focus();
		}
	});

	// after the swap effect, so the sync reads the newly-installed document
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

	onDestroy(() => {
		editorView?.destroy();
		group.release(editorView);
	});
</script>

<main bind:this={editor}></main>

<ContextMenu dialect="markdown" {onAddComment} {sourceAnchor} />

<style lang="postcss">
	@reference "../../../../app.css";

	/* (the code-block card's quiet inset is now the shared default in cmview.ts, so the override
	   that used to live here is gone) */
</style>
