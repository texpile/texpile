<script lang="ts">
	// The markdown visual editor: its OWN ProseMirror over mdSchema, fully separate from the tex
	// EditorView. Extensions are shared where they are schema-agnostic (they read state.schema);
	// everything LaTeX-flavored (intellisense, citations, template views, latex clipboard,
	// suggestion mode, the block-handle insert menu) is deliberately absent.
	import { onDestroy, onMount, untrack } from 'svelte';
	import { loadMathlive, mathliveLoaded, type MathlivePlugin } from '$lib/languages/mathliveLoad';
	import { EditorState, type Transaction } from 'prosemirror-state';
	import { swapParsedDoc, swapDocForNewFile, docSwapKind } from '$lib/editor/visual/docSwap';
	import { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { keymap } from 'prosemirror-keymap';
	import { baseKeymap, toggleMark } from 'prosemirror-commands';
	import { history } from 'prosemirror-history';
	import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
	import { gapCursor } from 'prosemirror-gapcursor';
	import { dropCursor } from 'prosemirror-dropcursor';
	import { fixTables, tableEditing, goToNextCell } from 'prosemirror-tables';
	import { tableViewOnly } from '$lib/editor/visual/extensions/table/tableViewOnly';
	import { wholeTableEdits } from '$lib/editor/visual/extensions/table/wholeTableEdits';
	import { crossBlockEdits } from '$lib/editor/visual/extensions/crossBlockEdits';
	import { firstRowHeader } from './firstRowHeader';
	import { tableAlignment } from './tableAlignment';
	import { createListPlugins, listInputRules, listKeymap, createIndentListCommand, createDedentListCommand } from 'prosemirror-flat-list';
	import { inputRules, textblockTypeInputRule, wrappingInputRule, InputRule, undoInputRule } from 'prosemirror-inputrules';
	import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
	import { deleteEmptyBlockForward, deleteEmptyFirstBlock } from '$lib/editor/visual/emptyBlockDelete';
	import { search } from 'prosemirror-search';
	import { mdSchema } from './schema';
	import { markdownCopyPlugin } from './clipboard';
	import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
	import { listAttrInheritance } from './listAttrInheritance';
	import { isMac } from '$lib/platform';
	import { referenceStore } from '$lib/stores/editorStore';
	import { groupView } from '$lib/editor/visual/groupView.svelte';
	import { revealBuiltEditor, BUILDING_CLASS } from '$lib/editor/visual/revealBuiltEditor';
	import { preferences } from '$lib/stores/preferencesStore.svelte';
	import { toggleHeading, toggleBlockQuote } from '$lib/editor/visual/helperCommands';
	import { selectAllScoped } from '$lib/editor/visual/selectAllScoped';
	import { extendToDocEnd, extendToDocStart, selectDocEnd, selectDocStart } from '$lib/editor/visual/selectDocBoundary';
	import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
	import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
	import { cmarrowHandlers } from '$lib/editor/visual/extensions/codemirrorbridge/cmarrowhandler';
	import { imagePlugin } from '$lib/editor/visual/extensions/image';
	import { createMarkdownImageSettings } from './imageSettings.svelte';
	import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
	import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
	import { shiftArrowsPlugin } from '$lib/editor/visual/extensions/shiftArrows/shiftArrowsPlugin';
	import { lineBreakPlugins } from '$lib/editor/visual/linebreak/lineBreakPlugin';
	import { createLinkPlugin } from '$lib/editor/visual/extensions/link';
	import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
	import { pasteMarkdownSource, visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
	import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
	import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
	import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
	import { createTocPlugin } from '$lib/editor/visual/extensions/tableofcontents/tocPlugin';
	import { createPersistentSelectionPlugin } from '$lib/editor/visual/extensions/persistentSelection/persistentSelectionPlugin';
	import { proofreadPlugin, spellClickBoundaryPlugin, spellProblemKeymap } from '$lib/editor/spellcheck/spellcheckplugin';
	import { createBoundaryClickPlugin } from '$lib/editor/visual/extensions/boundary-click-plugin';
	import { wordSelectionTrim } from '$lib/editor/visual/extensions/wordSelectionTrim';
	import { dragSelectionPlugin } from '$lib/editor/visual/extensions/dragSelection/dragSelectionPlugin';
	import { createBlockHandlePlugin } from '$lib/editor/visual/extensions/block-handle-plugin.svelte';
	import { wholeBlockDragPlugin } from '$lib/editor/visual/extensions/wholeBlockDrag';
	import { dropPastNodeViewsPlugin } from '$lib/editor/visual/extensions/dropPastNodeViews';
	import { createNodeFlashPlugin } from '$lib/editor/visual/extensions/flash-plugin';
	import { remoteCursorsPlugin } from '$lib/editor/visual/extensions/remoteCursors';
	import { MD_BLOCK_INSERT_ITEMS } from './blockInsertItems';
	import { CodeBlockView } from '$lib/editor/visual/extensions/codemirrorbridge/cmview.svelte';
	import { RawLatexView } from '$lib/editor/visual/extensions/raw-latex/rawLatexView';
	import { InlineLatexView } from '$lib/editor/visual/extensions/raw-latex/inlineLatexView';
	import ContextMenu from '$lib/editor/visual/contextMenu/ContextMenu.svelte';
	import { pmComments } from '$lib/editor/visual/extensions/pmComments';
	import { syncPmComments } from '$lib/editor/visual/extensions/pmCommentsSync.svelte';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
	import type { CommentRange } from '$lib/editor/visual/extensions/comments';
	import type { RegionParser, SourceMap } from '$lib/editor/visual/sourceSpans';
	import type { BiblatexReference } from '$lib/languages/bib/biblatex';
	import 'prosemirror-view/style/prosemirror.css';
	import 'prosemirror-tables/style/tables.css';
	import 'prosemirror-gapcursor/style/gapcursor.css';
	import 'prosemirror-flat-list/dist/style.css';
	import 'prosemirror-search/style/search.css';
	import '$lib/editor/visual/extensions/image/styles/common.css';
	import '$lib/editor/visual/extensions/image/styles/withResize.css';
	import '$lib/editor/visual/extensions/image/styles/sideResize.css';
	import '$lib/editor/visual/styles/cursor.css';

	type Props = {
		/** false in a parked editor group: no typing, and it follows the focused editor on the same file */
		live?: boolean;
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		onSelectionChange?: () => void;
		localReferences?: BiblatexReference[];
		imageDir?: string;
		docPath?: string | null;
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

	// markdown-flavored autoformat: # headings, > quotes, ``` fences, --- rules
	const mdInputRules = [
		textblockTypeInputRule(/^(#{1,6})\s$/, mdSchema.nodes.heading, (m) => ({ level: m[1].length })),
		wrappingInputRule(/^>\s$/, mdSchema.nodes.blockquote),
		textblockTypeInputRule(/^```$/, mdSchema.nodes.code_block, { env: 'fence', args: '' }),
		new InputRule(/^(?:---|\*\*\*)\s$/, (state, _match, start, end) =>
			state.tr.replaceRangeWith(start, end, mdSchema.nodes.horizontal_rule.create())
		)
	];

	onMount(() => {
		const mathlive = mathliveLoaded();
		if (mathlive) build(mathlive);
		else void loadMathlive().then(build);
	});

	function build({ mathlivePlugin, mlarrowHandlers }: MathlivePlugin): void {
		if (!editor) return;

		const plugins = [
			parseCarryPlugin,
			markdownCopyPlugin,
			gapCursor(),
			dropCursor({ color: 'var(--color-primary-500)', width: 2, class: 'pm-drop-cursor' }),
			// TableView WITHOUT columnResizing: a pipe table has no width syntax, so a dragged column
			// could never be written to the file. It used to move on screen and be silently discarded
			// on the next parse - a control that lied. The node view is kept because it is what
			// renders the <colgroup>; only the drag handlers are gone.
			tableViewOnly,
			tableEditing(),
			wholeTableEdits,
			crossBlockEdits,
			visualSmartPaste('markdown', mdSchema, pasteMarkdownSource),
			firstRowHeader,
			tableAlignment,
			...createListPlugins({ schema: mdSchema }),
			listAttrInheritance,
			history(),
			// before the list keymap, whose Backspace and Delete act at a block edge: they would join the block after an empty one into it, and a block into a figure
			keymap({ Backspace: deleteEmptyFirstBlock, Delete: deleteEmptyBlockForward }),
			keymap({ Backspace: selectFigureBackward, Delete: selectFigureForward }),
			shiftArrowsPlugin(),
			keymap(listKeymap),
			inputRules({ rules: [...listInputRules, ...mdInputRules] }),
			keymap({
				'Mod-z': undoVisual,
				'Mod-y': redoVisual,
				'Mod-Shift-z': redoVisual,
				Backspace: undoInputRule,
				'Mod-a': selectAllScoped,
				'Mod-Home': selectDocStart,
				'Mod-End': selectDocEnd,
				'Shift-Mod-Home': extendToDocStart,
				'Shift-Mod-End': extendToDocEnd,
				'Mod-b': toggleMark(mdSchema.marks.strong),
				'Mod-i': toggleMark(mdSchema.marks.em),
				'Mod-`': toggleMark(mdSchema.marks.code),
				'Mod-Shift-x': toggleMark(mdSchema.marks.s),
				'Mod-Shift-b': toggleBlockQuote(),
				'Mod-Shift-`': createCodeBlock(),
				// Word/Docs convention, same as the tex editor; markdown gets all six levels
				'Mod-Alt-0': toggleHeading(0),
				...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`Mod-Alt-${n}`, toggleHeading(n)])),
				...(isMac ? {} : { 'Mod-Shift-1': toggleHeading(1), 'Mod-Shift-2': toggleHeading(2), 'Mod-Shift-3': toggleHeading(3) }),
				'Mod-m': createMathField(),
				'Mod-Shift-m': createMathField(true),
				// table cell first, then list indent; always consume so focus stays in the editor
				Tab: (state, dispatch) => goToNextCell(1)(state, dispatch) || createIndentListCommand()(state, dispatch) || true,
				'Shift-Tab': (state, dispatch) => goToNextCell(-1)(state, dispatch) || createDedentListCommand()(state, dispatch) || true
			}),
			cmarrowHandlers,
			mlarrowHandlers,
			mathlivePlugin,
			keymap(baseKeymap),
			imagePlugin(createMarkdownImageSettings(imageDir === undefined ? undefined : () => imageDir ?? '')),
			menuUpdatePlugin(),
			createCursorPlugin(),
			...lineBreakPlugins(),
			createLinkPlugin({ onOpen: onOpenLink }),
			pasteUuidFixPlugin,
			search(),
			placeholderPlugin(placeholder),
			tablePlaceholderPlugin(),
			createWordCountPlugin(),
			createTocPlugin(),
			createPersistentSelectionPlugin(),
			spellClickBoundaryPlugin, // must precede proofreadPlugin; see its comment
			proofreadPlugin,
			spellProblemKeymap,
			createBoundaryClickPlugin(),
			wordSelectionTrim(),
			dragSelectionPlugin(),
			// the Notion-style + / drag / delete gutter, with the markdown insert set
			createBlockHandlePlugin({ items: MD_BLOCK_INSERT_ITEMS }),
			wholeBlockDragPlugin(),
			dropPastNodeViewsPlugin(),
			createNodeFlashPlugin(),
			// collaborators' carets; VisualCollab feeds it, and is inert outside a shared session
			remoteCursorsPlugin,
			...pmComments({
				onSelect: (id) => onSelectComment?.(id),
				onAdd: onAddComment,
				sourceAnchor,
				addLabel: addCommentLabel
			})
		];

		let editorState = EditorState.create({ schema: mdSchema, plugins, doc: localValue ?? undefined });
		const fix = fixTables(editorState);
		if (fix) editorState = editorState.apply(fix.setMeta('addToHistory', false));

		editorView = new EditorView(editor, {
			attributes: { class: 'TexpileEditor MarkdownEditor', spellcheck: 'false' },
			state: editorState,
			nodeViews: {
				code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos as () => number),
				// md raw islands are html/markdown chunks: always the plain CM views, none of the
				// latex-specific frontmatter/bibliography/figure specializations
				raw_latex: (node, view, getPos) => new RawLatexView(node, view, getPos as () => number),
				inline_latex: (node, view, getPos) => new InlineLatexView(node, view, getPos as () => number)
			},
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
		});

		group.claim(editorView);
		// before onReady, which takes the loading bar down: the reveal is what turns the stand-ins on
		// screen into the real thing, so announcing readiness first would show a document mid-upgrade
		revealBuiltEditor(editor);
		if (live) editorView.focus();
		onReady?.();
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
		// another file's formulas drawn in this frame, as a fresh build draws them, not as blanks for one
		if (kind === 'newFile') {
			revealBuiltEditor(editor);
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

<ContextMenu dialect="markdown" {onAddComment} {sourceAnchor} />

<style lang="postcss">
	@reference "../../../../app.css";

	/* (the code-block card's quiet inset is now the shared default in cmview.ts, so the override
	   that used to live here is gone) */
</style>
