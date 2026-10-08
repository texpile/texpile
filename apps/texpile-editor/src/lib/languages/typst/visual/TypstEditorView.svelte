<script lang="ts">
	// The Typst visual editor: its OWN ProseMirror over typSchema, third sibling of EditorView and
	// MarkdownEditorView. Extensions are shared only where they are schema-agnostic (they read
	// state.schema); everything whose editing model is LaTeX-shaped (tables, MathLive, images,
	// intellisense, citations, the latex clipboard) is deliberately absent — those constructs
	// live in raw islands until they get typst-aware machinery (see typSchema's comment).
	import { onDestroy, onMount, untrack } from 'svelte';
	import { EditorState, type Transaction } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { fixTables } from 'prosemirror-tables';
	import { typSchema } from './schema';
	import { typstEditorPlugins, typstNodeViews } from './typstEditorSetup';
	import { swapParsedDoc, swapDocForNewFile, docSwapKind } from '$lib/editor/visual/docSwap';
	import { referenceStore } from '$lib/stores/editorStore';
	import { groupView } from '$lib/editor/visual/groupView.svelte';
	import { revealBuiltEditor, BUILDING_CLASS } from '$lib/editor/visual/revealBuiltEditor';
	import type { BiblatexReference } from '$lib/languages/bib/biblatex';
	import { preferences } from '$lib/stores/preferencesStore.svelte';
	import ContextMenu from '$lib/editor/visual/contextMenu/ContextMenu.svelte';
	import type { ShowInOutput } from '$lib/editor/visual/contextMenu/showInOutput';
	import { syncPmComments } from '$lib/editor/visual/extensions/pmCommentsSync.svelte';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
	import type { CommentRange } from '$lib/editor/visual/extensions/comments';
	import type { RegionParser, SourceMap } from '$lib/editor/visual/sourceSpans';
	import 'prosemirror-view/style/prosemirror.css';
	import 'prosemirror-tables/style/tables.css';
	import 'prosemirror-gapcursor/style/gapcursor.css';
	import 'prosemirror-flat-list/dist/style.css';
	import 'prosemirror-search/style/search.css';
	import '$lib/editor/visual/extensions/image/styles/common.css';
	import '$lib/editor/visual/styles/cursor.css';

	type Props = {
		/** false in a parked editor group: no typing, and it follows the focused editor on the same file */
		live?: boolean;
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		onSelectionChange?: () => void;
		placeholder?: string;
		onReady?: () => void;
		/** the link tooltip's Open action: return true when handled in-app, false for the browser. */
		onOpenLink?: (href: string) => boolean;
		/** the open file's directory; #include chips resolve their paths against it */
		docDir?: string;
		docPath?: string | null;
		/** the project's bibliography; @target chips resolve against it for display */
		localReferences?: BiblatexReference[];
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
		/** pick citations from Zotero, offered in the context menu when present */
		onInsertCitation?: () => void;
		/** cite by DOI or arXiv ID, offered in the context menu when present */
		onCiteByDoi?: () => void;
		/** Show in PDF from the right-click menu */
		showInOutput?: ShowInOutput;
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
		placeholder = '',
		onReady,
		onOpenLink,
		docDir = '',
		docPath = null,
		localReferences = [],
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

	onMount(async () => {
		// the math fields read and write each equation's Typst, parsed by Typst's own parser
		const [{ mathlivePlugin, mlarrowHandlers }, { configureTypst }, { parseTypstMath }] = await Promise.all([
			import('$lib/editor/visual/extensions/mathlivebridge/mlplugin'),
			import('mathlive'),
			import('texpile-typst-syntax-wasm')
		]);
		configureTypst({ parse: parseTypstMath });

		const plugins = typstEditorPlugins({
			mathlivePlugin,
			mlarrowHandlers,
			docDir: () => docDir,
			placeholder,
			onOpenLink,
			onSelectComment,
			onAddComment,
			sourceAnchor,
			addCommentLabel
		});

		let editorState = EditorState.create({ schema: typSchema, plugins, doc: localValue ?? undefined });
		const fix = fixTables(editorState);
		if (fix) editorState = editorState.apply(fix.setMeta('addToHistory', false));

		editorView = new EditorView(editor, {
			attributes: { class: 'TexpileEditor TypstEditor', spellcheck: 'false' },
			state: editorState,
			nodeViews: typstNodeViews(() => docDir),
			editable: group.editable,
			dispatchTransaction(this: EditorView, transaction: Transaction) {
				// async plugins (spellcheck) can dispatch into a destroyed view on tab switches
				if (this.isDestroyed) return;
				const newState = this.state.apply(transaction);
				this.updateState(newState);
				// collabRemotePatch: a collaborator's edit patched in from the shared doc. It is
				// already IN the shared doc, so reporting it as a local change would echo it back
				if (onLocalChange && transaction.docChanged && !transaction.getMeta('collabRemotePatch')) onLocalChange(newState.doc);
				if (transaction.getMeta('collabRemotePatch')) remotePatches++;
				if (onSelectionChange && (transaction.selectionSet || transaction.docChanged)) onSelectionChange();
			}
		});

		group.claim(editorView);
		// before onReady, which takes the loading bar down: the reveal is what turns the stand-ins on
		// screen into the real thing, so announcing readiness first would show a document mid-upgrade
		revealBuiltEditor(editor);
		if (live) editorView.focus();
		onReady?.();
	});

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
		if (kind === 'newFile') swapDocForNewFile(editorView, typSchema, next);
		else swapParsedDoc(editorView, typSchema, next);
		docEpoch++;
		if (kind === 'newFile') {
			onReady?.();
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

	$effect(() => {
		if (editorView?.dom) {
			(editorView.dom as HTMLElement).style.setProperty('zoom', `${preferences.zoom}`, 'important');
		}
	});

	onDestroy(() => {
		editorView?.destroy();
		group.release(editorView);
	});
</script>

<!-- invisible, not hidden: display:none gives it no box, and an element with no box intersects
     nothing, so the viewport upgrades could not run until after it was already on screen -->
<main bind:this={editor} class={BUILDING_CLASS}></main>

<ContextMenu dialect="typst" {onAddComment} {sourceAnchor} {onInsertCitation} {onCiteByDoi} {showInOutput} />

<style lang="postcss">
	@reference "../../../../app.css";

	/* (the code-block card's quiet inset is now the shared default in cmview.ts, so the override
	   that used to live here is gone) */

	/* raw-island insets are tightened in RawLatexView itself (all dialects), nothing typst-specific */

	/* A labeled equation shows its <label> where LaTeX shows "(1)": the editor cannot know the
	   real number (numbering is the template's #set math.equation rule), but the label proves the
	   equation is referenceable and is exactly what the @ picker offers. mlview sets the attr. */
	:global(.TypstEditor .block-math-container[data-typst-label]:not([data-typst-label=''])::after) {
		content: '<' attr(data-typst-label) '>';
		position: absolute;
		right: calc(var(--spacing) * 4);
		top: 50%;
		transform: translateY(-50%);
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.8em;
		color: var(--muted-text);
		user-select: none;
		pointer-events: none;
	}
	/* keep the hover gear clear of the chip, the way the LaTeX number pushes it left */
	:global(.TypstEditor .block-math-container[data-typst-label]:not([data-typst-label='']) .math-settings-container) {
		right: calc(var(--spacing) * 20);
	}

	/* @target chips: citation tint when the key resolves in the bibliography, neutral otherwise */
	:global(.TypstEditor .typ-ref) {
		border-radius: var(--radius-base);
		padding: 0 0.2em;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.85em;
		background: color-mix(in srgb, var(--color-surface-500) 14%, transparent);
		cursor: pointer;
	}
	:global(.TypstEditor .typ-ref-known) {
		background: color-mix(in srgb, var(--color-primary-500) 16%, transparent);
		color: var(--primary-ink);
	}
	:global(.dark .TypstEditor .typ-ref-known) {
		color: var(--primary-ink);
	}

	/* figure-wrapped tables render through the shared tableWrapperView (typst mode), which owns
	   the "Table N" header and caption layout; numbering stays approximate (raw-island tables
	   aren't counted, the preview is the authority) */

	/* term lists: bold term line, hanging description */
	:global(.TypstEditor .term-item) {
		margin: calc(var(--spacing) * 1) 0;
	}
	:global(.TypstEditor .term-title) {
		font-weight: 600;
	}
	:global(.TypstEditor .term-item > :not(.term-title)) {
		margin-left: calc(var(--spacing) * 5);
	}
</style>
