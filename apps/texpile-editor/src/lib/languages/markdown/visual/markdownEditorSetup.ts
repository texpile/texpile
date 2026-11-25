// plugin stack and autoformat rules for the Markdown visual editor; MarkdownEditorView.svelte mounts it
import type { Plugin } from 'prosemirror-state';
import { keymap } from 'prosemirror-keymap';
import { pmCommandKeys } from '$lib/keybindings/editors/pmCommandKeys';
import { pmEditorScope } from '$lib/keybindings/editors/editorScopes';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import { heldGapCursor } from '$lib/editor/visual/gapArrows';
import { oldWordsArrowsPlugin } from '$lib/editor/visual/extensions/pmOldWordsCaret';
import { caretArrowsPlugin } from '$lib/editor/canvas';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import { wholeTableEdits } from '$lib/editor/visual/extensions/table/wholeTableEdits';
import { tabThroughCells } from '$lib/editor/visual/extensions/table/rows/addTableRow';
import { enterInTable } from '$lib/editor/visual/extensions/table/rows/cellEnter';
import { crossBlockEdits } from '$lib/editor/visual/extensions/crossBlockEdits';
import {
	createListClipboardPlugin,
	createListEventPlugin,
	bulletListInputRule,
	orderedListInputRule,
	taskListInputRule,
	wrappingListInputRule,
	listKeymap,
	createIndentListCommand,
	createDedentListCommand
} from 'prosemirror-flat-list';
import { inputRules, textblockTypeInputRule, wrappingInputRule, InputRule, undoInputRule } from 'prosemirror-inputrules';
import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
import { liftFromStyleEnvironment } from '$lib/editor/visual/liftFromStyleEnvironment';
import { deleteEmptyBlockBackward, deleteEmptyBlockForward } from '$lib/editor/visual/emptyBlockDelete';
import { visualFindPlugin } from '$lib/editor/visual/find/visualFindPlugin';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { toggleHeading, toggleBlockQuote, insertHardBreak } from '$lib/editor/visual/helperCommands';
import { selectAllScoped } from '$lib/editor/visual/selectAllScoped';
import {
	extendToDocEnd,
	extendToDocStart,
	holdAtDocEnd,
	holdAtDocStart,
	selectDocEnd,
	selectDocStart
} from '$lib/editor/visual/selectDocBoundary';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
import { mathInputRules } from '$lib/editor/visual/extensions/mathlivebridge/mathInputRule';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { imagePlugin } from '$lib/editor/visual/extensions/image';
import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
import { primarySelectionPlugin } from '$lib/editor/visual/extensions/primarySelection';
import { heldWidthPlugin } from '$lib/editor/visual/extensions/heldWidth';
import { islandKeysPlugin } from '$lib/editor/canvas/islands/islandKeys';
import { islandCompletionPlugin } from '$lib/editor/visual/extensions/raw-latex/completion/islandCompletion';
import { wordBeingTypedPlugin } from '$lib/editor/canvas/layout/linebreak/wordBeingTyped';
import { createLinkPlugin } from '$lib/editor/visual/extensions/link';
import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
import { pasteMarkdownSource, visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { createTocPlugin } from '$lib/editor/visual/extensions/tableofcontents/tocPlugin';
import { itemLabelsWithBullets, listNumbersPlugin, MARKDOWN_BULLETS } from '$lib/editor/visual/extensions/listNumbers/listNumbers';
import { createPersistentSelectionPlugin } from '$lib/editor/visual/extensions/persistentSelection/persistentSelectionPlugin';
import { proofreadPlugin, spellClickBoundaryPlugin, spellProblemKeymap } from '$lib/editor/spellcheck/spellcheckplugin';
import { typedWordPlugin } from '$lib/editor/spellcheck/proofreadHold';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { createBlockHandlePlugin } from '$lib/editor/visual/extensions/block-handle-plugin.svelte';
import { blockBarPlugin } from '$lib/editor/visual/extensions/blockBar/blockBarPlugin.svelte';
import { wholeBlockDragPlugin } from '$lib/editor/visual/extensions/wholeBlockDrag';
import { createNodeFlashPlugin } from '$lib/editor/visual/extensions/flash-plugin';
import { remoteCursorsPlugin } from '$lib/editor/visual/extensions/remoteCursors';
import { pmComments } from '$lib/editor/visual/extensions/pmComments';
import type { CommentAnchor } from '$lib/comments/anchor';
import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
import { mdSchema } from './schema';
import { markdownCopyPlugin } from './clipboard';
import { listAttrInheritance } from './listAttrInheritance';
import { firstRowHeader } from './firstRowHeader';
import { tableAlignment } from './tableAlignment';
import { markdownInsertItems } from './blockInsertItems';
import { createMarkdownImageSettings } from './imageSettings.svelte';

// markdown-flavored autoformat: # headings, > quotes, ``` fences, --- rules
const mdInputRules = [
	textblockTypeInputRule(/^(#{1,6})\s$/, mdSchema.nodes.heading, (m) => ({ level: m[1].length })),
	wrappingInputRule(/^>\s$/, mdSchema.nodes.blockquote),
	textblockTypeInputRule(/^```$/, mdSchema.nodes.code_block, { env: 'fence', args: '' }),
	new InputRule(/^(?:---|\*\*\*)\s$/, (state, _match, start, end) =>
		state.tr.replaceRangeWith(start, end, mdSchema.nodes.horizontal_rule.create())
	),
	...mathInputRules('latex')
];

export type MarkdownEditorSetup = {
	/** resolved by the caller's dynamic import so mathlive stays off the critical path */
	mathlivePlugin: Plugin;
	mlarrowHandlers: Plugin;
	imageDir?: () => string;
	placeholder: string;
	/** the link tooltip's Open action: true when handled in-app (a workspace-relative Markdown link), false for the browser */
	onOpenLink?: (href: string) => boolean;
	onSelectComment?: (id: string) => void;
	onAddComment?: (anchor: CommentAnchor | null) => void;
	/** the selection as a range of the file; see pmComments */
	sourceAnchor?: SourceAnchorFn;
	addCommentLabel: string;
	/** read at each check: the editor's file can change its language */
	spellLanguage: () => SpellLanguage | null;
};

export function markdownEditorPlugins(setup: MarkdownEditorSetup): Plugin[] {
	const {
		mathlivePlugin,
		mlarrowHandlers,
		imageDir,
		placeholder,
		onOpenLink,
		onSelectComment,
		onAddComment,
		sourceAnchor,
		addCommentLabel,
		spellLanguage
	} = setup;
	return [
		parseCarryPlugin,
		islandCompletionPlugin(),
		markdownCopyPlugin,
		oldWordsArrowsPlugin(),
		caretArrowsPlugin(),
		heldGapCursor(),
		tableEditing(),
		wholeTableEdits,
		crossBlockEdits,
		visualSmartPaste('markdown', mdSchema, pasteMarkdownSource),
		firstRowHeader,
		tableAlignment,
		createListEventPlugin(),
		createListClipboardPlugin(mdSchema),
		listAttrInheritance,
		history(),
		// before the list keymap, whose Backspace and Delete act at a block edge: they would join the block after an empty one into it, and a block into a figure
		keymap({ Backspace: liftFromStyleEnvironment }),
		keymap({ Backspace: deleteEmptyBlockBackward, Delete: deleteEmptyBlockForward }),
		keymap({ Backspace: selectFigureBackward, Delete: selectFigureForward }),
		primarySelectionPlugin(),
		heldWidthPlugin(),
		islandKeysPlugin(),
		keymap(listKeymap),
		// no toggle item: Markdown has no syntax for one
		inputRules({
			rules: [
				...[bulletListInputRule, orderedListInputRule, taskListInputRule].map(({ regexp, getAttrs }) =>
					wrappingListInputRule(regexp, getAttrs)
				),
				...mdInputRules
			]
		}),
		pmCommandKeys({
			'editor.bold': toggleMark(mdSchema.marks.strong),
			'editor.italic': toggleMark(mdSchema.marks.em),
			'editor.inlineCode': toggleMark(mdSchema.marks.code),
			'editor.strikethrough': toggleMark(mdSchema.marks.s),
			'editor.blockquote': toggleBlockQuote(),
			'editor.codeBlock': createCodeBlock(),
			'editor.inlineMath': createMathField(),
			'editor.displayMath': createMathField(true),
			// markdown gets all six levels
			...Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((n) => [`editor.heading${n}`, toggleHeading(n)]))
		}),
		pmEditorScope('markdown'),
		keymap({
			'Mod-z': undoVisual,
			'Mod-y': redoVisual,
			'Mod-Shift-z': redoVisual,
			Backspace: undoInputRule,
			'Mod-a': selectAllScoped,
			'Mod-Home': selectDocStart,
			ArrowUp: holdAtDocStart,
			ArrowLeft: holdAtDocStart,
			ArrowDown: holdAtDocEnd,
			ArrowRight: holdAtDocEnd,
			'Mod-End': selectDocEnd,
			'Shift-Mod-Home': extendToDocStart,
			'Shift-Mod-End': extendToDocEnd,
			Enter: enterInTable,
			'Shift-Enter': insertHardBreak,
			// table cell first, then list indent; always consume so focus stays in the editor
			Tab: (state, dispatch, view) => tabThroughCells(state, dispatch, view) || createIndentListCommand()(state, dispatch) || true,
			'Shift-Tab': (state, dispatch) => goToNextCell(-1)(state, dispatch) || createDedentListCommand()(state, dispatch) || true
		}),
		mlarrowHandlers,
		mathlivePlugin,
		keymap(baseKeymap),
		imagePlugin(createMarkdownImageSettings(imageDir)),
		menuUpdatePlugin(),
		createCursorPlugin(),
		wordBeingTypedPlugin(),
		createLinkPlugin({ onOpen: onOpenLink }),
		pasteUuidFixPlugin,
		visualFindPlugin(),
		placeholderPlugin(placeholder),
		tablePlaceholderPlugin(),
		createWordCountPlugin(),
		createTocPlugin(),
		listNumbersPlugin(itemLabelsWithBullets(MARKDOWN_BULLETS)),
		createPersistentSelectionPlugin(),
		spellClickBoundaryPlugin, // must precede proofreadPlugin; see its comment
		proofreadPlugin(spellLanguage),
		typedWordPlugin,
		spellProblemKeymap,
		// the Notion-style + / drag / delete gutter, with the markdown insert set
		createBlockHandlePlugin({ items: markdownInsertItems }),
		blockBarPlugin(),
		wholeBlockDragPlugin(),
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
}
