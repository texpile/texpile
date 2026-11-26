// plugin stack, autoformat rules and paste handling for the Typst visual editor; TypstEditorView.svelte mounts it
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { typstToProseMirror } from './convert/converter';
import { typstCopyPlugin } from './clipboard';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { labelRenameUndo } from '$lib/editor/visual/repointRefs';
import { createSuggestPlugin } from '$lib/editor/visual/extensions/suggest/suggestPlugin';
import { selectAllScoped } from '$lib/editor/visual/selectAllScoped';
import {
	extendToDocEnd,
	extendToDocStart,
	holdAtDocEnd,
	holdAtDocStart,
	selectDocEnd,
	selectDocStart
} from '$lib/editor/visual/selectDocBoundary';
import { lineEdgeKeys } from '$lib/editor/visual/lineEdgeArrows';
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
import { columnResize } from '$lib/editor/visual/extensions/table/canvas/columnResize';
import { captureColumnWidths } from '$lib/editor/visual/extensions/table/captureColumnWidths';
import {
	createListEventPlugin,
	listKeymap,
	createDedentListCommand,
	wrappingListInputRule,
	type ListAttributes
} from 'prosemirror-flat-list';
import { indentListItem } from '$lib/editor/visual/extensions/listIndent/listIndent';
import { inputRules, textblockTypeInputRule, InputRule, undoInputRule, smartQuotes, ellipsis } from 'prosemirror-inputrules';
import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
import { deleteEmptyBlockBackward, deleteEmptyBlockForward } from '$lib/editor/visual/emptyBlockDelete';
import { deleteSelectedBlock } from '$lib/editor/visual/selectedBlockDelete';
import { liftFromStyleEnvironment } from '$lib/editor/visual/liftFromStyleEnvironment';
import { emDashRule, enDashRule, emDashUpgradeRule } from '$lib/editor/visual/extensions/inputrules/dashRules';
import { visualFindPlugin } from '$lib/editor/visual/find/visualFindPlugin';
import { typSchema } from './schema';
import { pluginEditorPlugins } from './core/plugin/editorPieces';
import { hasTypstMarkup } from './pasteMarkup';
import { splitBlockWithoutDuplicates, toggleHeading } from '$lib/editor/visual/helperCommands';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
import { mathInputRules } from '$lib/editor/visual/extensions/mathlivebridge/mathInputRule';
import { imagePlugin } from '$lib/editor/visual/extensions/image';
import { createTypstImageSettings } from './imageSettings.svelte';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
import { wordBeingTypedPlugin } from '$lib/editor/canvas/layout/linebreak/wordBeingTyped';
import { createLinkPlugin } from '$lib/editor/visual/extensions/link';
import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { pasteReadingOfText } from '$lib/editor/paste/pasteReadingOfText';
import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { typstProse } from '$lib/workspace/wordCount/proseWords';
import { createTocPlugin } from '$lib/editor/visual/extensions/tableofcontents/tocPlugin';
import { itemLabelsWithBullets, listNumbersPlugin, TYPST_BULLETS } from '$lib/editor/visual/extensions/listNumbers/listNumbers';
import { createPersistentSelectionPlugin } from '$lib/editor/visual/extensions/persistentSelection/persistentSelectionPlugin';
import { proofreadPlugin, spellClickBoundaryPlugin, spellProblemKeymap } from '$lib/editor/spellcheck/spellcheckplugin';
import { typedWordPlugin } from '$lib/editor/spellcheck/proofreadHold';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { createBlockHandlePlugin } from '$lib/editor/visual/extensions/block-handle-plugin.svelte';
import { blockBarPlugin } from '$lib/editor/visual/extensions/blockBar/blockBarPlugin.svelte';
import { wholeBlockDragPlugin } from '$lib/editor/visual/extensions/wholeBlockDrag';
import { createNodeFlashPlugin } from '$lib/editor/visual/extensions/flash-plugin';
import { remoteCursorsPlugin } from '$lib/editor/visual/extensions/remoteCursors';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { primarySelectionPlugin } from '$lib/editor/visual/extensions/primarySelection';
import { heldWidthPlugin } from '$lib/editor/visual/extensions/heldWidth';
import { islandKeysPlugin } from '$lib/editor/canvas/islands/islandKeys';
import { islandCompletionPlugin } from '$lib/editor/visual/extensions/raw-latex/completion/islandCompletion';
import { footnoteNumbersPlugin } from '$lib/editor/visual/extensions/drawnChips/footnote/footnoteNumbers';
import { typstChipCounts } from './core/plugin/chipCounts';
import { typstNumbersKey, typstNumbersPlugin } from './extensions/numbers/typstNumbersPlugin';
import { unnumberHeading } from '$lib/editor/visual/unnumberHeading';
import { pmComments } from '$lib/editor/visual/extensions/pmComments';
import type { CommentAnchor } from '$lib/comments/anchor';
import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
import { toLf } from '$lib/workspace/edits/lineEndings';

// typst-flavored autoformat: = headings, ``` fences, - / + / 1. lists. Deliberately no task
// rule: the serializer has no typst form for a checkbox, so a task list must not be creatable.
const typInputRules = [
	textblockTypeInputRule(/^(={1,6})\s$/, typSchema.nodes.heading, (m) => ({ level: m[1].length })),
	textblockTypeInputRule(/^```$/, typSchema.nodes.code_block, { env: 'fence', args: '' }),
	wrappingListInputRule<ListAttributes>(/^\s?[-*]\s$/, { kind: 'bullet' }),
	wrappingListInputRule<ListAttributes>(/^\s?\+\s$/, { kind: 'ordered' }),
	wrappingListInputRule<ListAttributes>(/^\s?\d+\.\s$/, { kind: 'ordered' }),
	// "--- " (or the em dash the dash rules already made of it) alone on a line: divider
	new InputRule(/^(?:---|—)\s$/, (state, _m, start, end) =>
		state.tr.replaceRangeWith(start, end, typSchema.nodes.horizontal_rule.create())
	),
	// smart typography, same rules as the tex editor; the serializer emits the literal
	// characters and typst renders them as written
	...smartQuotes,
	ellipsis,
	emDashRule,
	enDashRule,
	emDashUpgradeRule,
	...mathInputRules('typst')
];

// Pasted TYPST SOURCE becomes rich nodes - the typst counterpart of the latex clipboard.
// Gated on structural markers so ordinary prose still pastes as plain text. The parse knows
// nothing of this document, so the pasted blocks carry no origins and are always written out afresh.
function pasteTypstSource(view: EditorView, text: string): boolean {
	if (!hasTypstMarkup(text)) return false;
	try {
		const { doc } = typstToProseMirror(text);
		const blocks: PmNode[] = [];
		doc.forEach((c) => blocks.push(c));
		if (blocks.length === 0) return false;
		const frag = Fragment.fromArray(blocks);
		// a single pasted paragraph merges inline into the current one; anything more
		// structured inserts as whole blocks
		const open = blocks.length === 1 && blocks[0].type.name === 'paragraph' ? 1 : 0;
		pasteReadingOfText(view, text, new Slice(frag, open, open));
		return true;
	} catch {
		return false; // unparsable clipboard: let the plain-text path have it
	}
}

// html-flavored pastes keep ProseMirror's own path; smart paste reads a code editor's copy itself
const pasteTypstPlugin = new Plugin({
	props: {
		handlePaste(view, event) {
			const cb = event.clipboardData;
			const text = cb?.getData('text/plain');
			if (!text || cb?.getData('text/html')) return false;
			return pasteTypstSource(view, toLf(text));
		}
	}
});

export type TypstEditorSetup = {
	/** resolved by the caller's dynamic import so mathlive stays off the critical path */
	mathlivePlugin: Plugin;
	mlarrowHandlers: Plugin;
	docDir: () => string;
	placeholder: string;
	onOpenLink?: (href: string) => boolean;
	onSelectComment?: (id: string) => void;
	onAddComment?: (anchor: CommentAnchor | null) => void;
	/** the selection as a range of the file; see pmComments */
	sourceAnchor?: SourceAnchorFn;
	addCommentLabel: string;
	/** read at each check: the editor's file can change its language */
	spellLanguage: () => SpellLanguage | null;
	/** the open file, whose document's printed numbers it shows */
	filePath?: () => string | null;
};

export function typstEditorPlugins(setup: TypstEditorSetup): Plugin[] {
	const {
		mathlivePlugin,
		mlarrowHandlers,
		docDir,
		placeholder,
		onOpenLink,
		onSelectComment,
		onAddComment,
		sourceAnchor,
		addCommentLabel,
		spellLanguage,
		filePath
	} = setup;
	return [
		parseCarryPlugin,
		islandCompletionPlugin(),
		labelRenameUndo,
		...pluginEditorPlugins('atStart'),
		typstCopyPlugin,
		oldWordsArrowsPlugin(),
		caretArrowsPlugin(),
		heldGapCursor(),
		// Typst is the one dialect where a column drag can be saved: `columns:` takes real lengths and fr.
		// captureColumnWidths fills in the columns a drag leaves unsized, so the serializer writes proportions
		columnResize(),
		captureColumnWidths,
		tableEditing(),
		...pluginEditorPlugins('afterTableEditing'),
		wholeTableEdits,
		crossBlockEdits,
		visualSmartPaste('typst', typSchema, pasteTypstSource),
		pasteTypstPlugin,
		// flat-list's clipboard plugin is left out: Texpile's own copy (visualSmartPaste) writes lists as it did
		createListEventPlugin(),
		history(),
		// the @ reference/citation popup; its arrow/enter keymap must precede the others.
		// The picker inserts typ_ref atoms (it keys off the mounted schema)
		...createSuggestPlugin(),
		drawnChipAtomsPlugin(),
		primarySelectionPlugin(),
		heldWidthPlugin(),
		islandKeysPlugin(),
		// before the list keymap, whose Backspace and Delete act at a block edge: they would join the block after an empty one into it, and a block into a figure
		keymap({ Backspace: deleteSelectedBlock, Delete: deleteSelectedBlock }),
		keymap({ Backspace: unnumberHeading((state) => typstNumbersKey.getState(state)?.set) }),
		keymap({ Backspace: liftFromStyleEnvironment }),
		keymap({ Backspace: deleteEmptyBlockBackward, Delete: deleteEmptyBlockForward }),
		keymap({ Backspace: selectFigureBackward, Delete: selectFigureForward }),
		keymap(listKeymap),
		inputRules({ rules: typInputRules }),
		pmCommandKeys({
			'editor.bold': toggleMark(typSchema.marks.strong),
			'editor.italic': toggleMark(typSchema.marks.em),
			'editor.underline': toggleMark(typSchema.marks.u),
			'editor.superscript': toggleMark(typSchema.marks.sup),
			'editor.subscript': toggleMark(typSchema.marks.sub),
			'editor.inlineCode': toggleMark(typSchema.marks.code),
			'editor.codeBlock': createCodeBlock(),
			'editor.inlineMath': createMathField(),
			'editor.displayMath': createMathField(true),
			// typst headings nest to six
			...Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((n) => [`editor.heading${n}`, toggleHeading(n)]))
		}),
		pmEditorScope('typst'),
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
			...lineEdgeKeys,
			'Mod-End': selectDocEnd,
			'Shift-Mod-Home': extendToDocStart,
			'Shift-Mod-End': extendToDocEnd,
			Enter: (state, dispatch, view) => enterInTable(state, dispatch, view) || splitBlockWithoutDuplicates(state, dispatch),
			// table cell first, then list indent; always consume so focus stays in the editor
			Tab: (state, dispatch, view) => tabThroughCells(state, dispatch, view) || indentListItem()(state, dispatch) || true,
			'Shift-Tab': (state, dispatch) => goToNextCell(-1)(state, dispatch) || createDedentListCommand()(state, dispatch) || true
		}),
		mlarrowHandlers,
		mathlivePlugin,
		keymap(baseKeymap),
		imagePlugin(createTypstImageSettings(docDir)),
		menuUpdatePlugin(),
		createCursorPlugin(),
		wordBeingTypedPlugin(),
		createLinkPlugin({ onOpen: onOpenLink }),
		pasteUuidFixPlugin,
		visualFindPlugin(),
		placeholderPlugin(placeholder),
		tablePlaceholderPlugin(),
		createWordCountPlugin(typstProse),
		createTocPlugin(),
		listNumbersPlugin(itemLabelsWithBullets(TYPST_BULLETS)),
		createPersistentSelectionPlugin(),
		spellClickBoundaryPlugin, // must precede proofreadPlugin; see its comment
		proofreadPlugin(spellLanguage),
		typedWordPlugin,
		spellProblemKeymap,
		// the Notion-style + / drag / delete gutter, with the typst insert set
		createBlockHandlePlugin(),
		blockBarPlugin(),
		wholeBlockDragPlugin(),
		// before the footnote counter: a chip reads the first numbers it is handed
		typstNumbersPlugin({ filePath: filePath ?? (() => null) }),
		footnoteNumbersPlugin(typstChipCounts),
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
