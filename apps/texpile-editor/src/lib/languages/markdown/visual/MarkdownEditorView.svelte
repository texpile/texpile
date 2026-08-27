<script lang="ts">
	// The markdown visual editor: its OWN ProseMirror over mdSchema, fully separate from the tex
	// EditorView. Extensions are shared where they are schema-agnostic (they read state.schema);
	// everything LaTeX-flavored (intellisense, citations, template views, latex clipboard,
	// suggestion mode, the block-handle insert menu) is deliberately absent.
	import { onDestroy, onMount } from 'svelte';
	import { EditorState, type Transaction } from 'prosemirror-state';
	import { swapParsedDoc, swapDocForNewFile } from '$lib/editor/visual/docSwap';
	import { EditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { keymap } from 'prosemirror-keymap';
	import { baseKeymap, toggleMark } from 'prosemirror-commands';
	import { undo as historyUndo, redo as historyRedo, history } from 'prosemirror-history';
	import { gapCursor } from 'prosemirror-gapcursor';
	import { dropCursor } from 'prosemirror-dropcursor';
	import { fixTables, tableEditing, goToNextCell } from 'prosemirror-tables';
	import { tableViewOnly } from '$lib/editor/visual/extensions/table/tableViewOnly';
	import { createListPlugins, listInputRules, listKeymap, createIndentListCommand, createDedentListCommand } from 'prosemirror-flat-list';
	import { inputRules, textblockTypeInputRule, wrappingInputRule, InputRule, undoInputRule } from 'prosemirror-inputrules';
	import { search } from 'prosemirror-search';
	import { mdSchema } from './schema';
	import { markdownCopyPlugin } from './clipboard';
	import { isMac } from '$lib/platform';
	import { editorViewStore, referenceStore } from '$lib/stores/editorStore';
	import { revealBuiltEditor, BUILDING_CLASS } from '$lib/editor/visual/revealBuiltEditor';
	import { preferences } from '$lib/stores/preferencesStore.svelte';
	import { toggleHeading, toggleBlockQuote } from '$lib/editor/visual/helperCommands';
	import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
	import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
	import { cmarrowHandlers } from '$lib/editor/visual/extensions/codemirrorbridge/cmarrowhandler';
	import { imagePlugin } from '$lib/editor/visual/extensions/image';
	import { createMarkdownImageSettings } from './imageSettings.svelte';
	import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
	import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
	import { createLinkPlugin } from '$lib/editor/visual/extensions/link';
	import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
	import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
	import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
	import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
	import { createTocPlugin } from '$lib/editor/visual/extensions/tableofcontents/tocPlugin';
	import { createPersistentSelectionPlugin } from '$lib/editor/visual/extensions/persistentSelection/persistentSelectionPlugin';
	import { proofreadPlugin, spellClickBoundaryPlugin } from '$lib/editor/spellcheck/spellcheckplugin';
	import { createBoundaryClickPlugin } from '$lib/editor/visual/extensions/boundary-click-plugin';
	import { createBlockHandlePlugin } from '$lib/editor/visual/extensions/block-handle-plugin.svelte';
	import { createNodeFlashPlugin } from '$lib/editor/visual/extensions/flash-plugin';
	import { remoteCursorsPlugin } from '$lib/editor/visual/extensions/remoteCursors';
	import { MD_BLOCK_INSERT_ITEMS } from './blockInsertItems';
	import { CodeBlockView } from '$lib/editor/visual/extensions/codemirrorbridge/cmview.svelte';
	import { RawLatexView } from '$lib/editor/visual/extensions/raw-latex/rawLatexView';
	import { InlineLatexView } from '$lib/editor/visual/extensions/raw-latex/inlineLatexView';
	import ContextMenu from '$lib/editor/visual/toolbar/ContextMenu.svelte';
	import { pmComments } from '$lib/editor/visual/extensions/pmComments';
	import { syncPmComments } from '$lib/editor/visual/extensions/pmCommentsSync.svelte';
	import type { CommentAnchor } from '$lib/comments/anchor';
	import type { CommentThread } from '$lib/comments/log';
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
		localValue?: PMNode | null;
		onLocalChange?: (value: PMNode) => void;
		onSelectionChange?: () => void;
		localReferences?: BiblatexReference[];
		imageDir?: string;
		docPath?: string | null;
		placeholder?: string;
		onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
		onReady?: () => void;
		/** the link tooltip's Open action: return true when handled in-app (workspace-relative
		 * markdown link), false to fall through to the browser. */
		onOpenLink?: (href: string) => boolean;
		/** review comments, same contract as the latex EditorView; see extensions/pmComments */
		commentThreads?: CommentThread[];
		selectedComment?: string | null;
		onSelectComment?: (id: string, from: 'visual') => void;
		onAddComment?: (anchor: CommentAnchor | null) => void;
		onCommentsPlaced?: (lost: string[]) => void;
		addCommentLabel?: string;
		/** a composer is open for a selection here; false clears the pending selection tint */
		commentPendingActive?: boolean;
	};

	let {
		localValue = null,
		onLocalChange,
		onSelectionChange,
		localReferences = [],
		imageDir,
		docPath = null,
		placeholder = '',
		onHistoryBoundary,
		onReady,
		onOpenLink,
		commentThreads = [],
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

	// markdown-flavored autoformat: # headings, > quotes, ``` fences, --- rules
	const mdInputRules = [
		textblockTypeInputRule(/^(#{1,6})\s$/, mdSchema.nodes.heading, (m) => ({ level: m[1].length })),
		wrappingInputRule(/^>\s$/, mdSchema.nodes.blockquote),
		textblockTypeInputRule(/^```$/, mdSchema.nodes.code_block, { env: 'fence', args: '' }),
		new InputRule(/^(?:---|\*\*\*)\s$/, (state, _match, start, end) =>
			state.tr.replaceRangeWith(start, end, mdSchema.nodes.horizontal_rule.create())
		)
	];

	onMount(async () => {
		const { mathlivePlugin, mlarrowHandlers } = await import('$lib/editor/visual/extensions/mathlivebridge/mlplugin');

		const plugins = [
			markdownCopyPlugin,
			gapCursor(),
			dropCursor({ color: 'var(--color-primary-500)', width: 2 }),
			// TableView WITHOUT columnResizing: a pipe table has no width syntax, so a dragged column
			// could never be written to the file. It used to move on screen and be silently discarded
			// on the next parse - a control that lied. The node view is kept because it is what
			// renders the <colgroup>; only the drag handlers are gone.
			tableViewOnly,
			tableEditing(),
			...createListPlugins({ schema: mdSchema }),
			history(),
			keymap(listKeymap),
			inputRules({ rules: [...listInputRules, ...mdInputRules] }),
			keymap({
				// PM history first, then the workspace snapshot history (survives mode switches)
				'Mod-z': (state, dispatch) => historyUndo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('undo'), true) : false),
				'Mod-y': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
				'Mod-Shift-z': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
				Backspace: undoInputRule,
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
			createBoundaryClickPlugin(),
			// the Notion-style + / drag / delete gutter, with the markdown insert set
			createBlockHandlePlugin({ items: MD_BLOCK_INSERT_ITEMS }),
			createNodeFlashPlugin(),
			// collaborators' carets; VisualCollab feeds it, and is inert outside a shared session
			remoteCursorsPlugin,
			...pmComments({
				onSelect: (id) => onSelectComment?.(id, 'visual'),
				onAdd: onAddComment,
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
			editable: () => true,
			dispatchTransaction(this: EditorView, transaction: Transaction) {
				// async plugins (spellcheck) can dispatch into a destroyed view on tab switches
				if (this.isDestroyed) return;
				const newState = this.state.apply(transaction);
				this.updateState(newState);
				// collabRemotePatch: a collaborator's edit patched in from the shared doc. It is
				// already IN the shared doc, so reporting it as a local change would echo it back
				// out and the two peers would ping-pong the same edit
				if (onLocalChange && transaction.docChanged && !transaction.getMeta('collabRemotePatch')) onLocalChange(newState.doc);
				if (onSelectionChange && (transaction.selectionSet || transaction.docChanged)) onSelectionChange();
			}
		});

		editorViewStore.current = editorView;
		// before onReady, which takes the loading bar down: the reveal is what turns the stand-ins on
		// screen into the real thing, so announcing readiness first would show a document mid-upgrade
		revealBuiltEditor(editor);
		editorView.focus();
		onReady?.();
	});

	let mountedDoc: PMNode | null = null;
	let mountedPath: string | null = null;
	/** bumped only on doc SWAPS (see pmCommentsSync); typing maps ranges instead */
	let docEpoch = $state(0);
	$effect(() => {
		const next = localValue;
		const path = docPath;
		if (!editorView || !next) return;
		if (mountedDoc === null) {
			mountedDoc = next;
			mountedPath = path;
			return;
		}
		if (next === mountedDoc || next === editorView.state.doc) {
			mountedDoc = next;
			mountedPath = path;
			return;
		}

		const isAnotherFile = path !== mountedPath;
		if (isAnotherFile) swapDocForNewFile(editorView, mdSchema, next);
		else swapParsedDoc(editorView, mdSchema, next);
		mountedDoc = next;
		mountedPath = path;
		docEpoch++;
		if (isAnotherFile) onReady?.();
	});

	// after the swap effect, so the sync reads the newly-installed document
	syncPmComments({
		view: () => editorView,
		threads: () => commentThreads,
		dialect: 'md',
		epoch: () => docEpoch,
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
		editorViewStore.current = null;
	});
</script>

<!-- invisible, not hidden: display:none gives it no box, and an element with no box intersects
     nothing, so the viewport upgrades could not run until after it was already on screen -->
<main bind:this={editor} class={BUILDING_CLASS}></main>

<ContextMenu dialect="markdown" {onAddComment} />

<style lang="postcss">
	@reference "../../../../app.css";

	/* (the code-block card's quiet inset is now the shared default in cmview.ts, so the override
	   that used to live here is gone) */
</style>
