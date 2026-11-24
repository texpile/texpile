// plugin stack for the LaTeX visual editor; LatexEditorView.svelte mounts it
import type { Plugin } from 'prosemirror-state';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { keymap } from 'prosemirror-keymap';
import { pmCommandKeys } from '$lib/keybindings/editors/pmCommandKeys';
import { pmEditorScope } from '$lib/keybindings/editors/editorScopes';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history } from 'prosemirror-history';
import { undoVisual, redoVisual } from '$lib/editor/visual/visualUndo';
import { toggleBlockQuote, toggleHeading, cycleParagraphIndent, splitBlockWithoutDuplicates } from '$lib/editor/visual/helperCommands';
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
import { heldGapCursor } from '$lib/editor/visual/gapArrows';
import { oldWordsArrowsPlugin } from '$lib/editor/visual/extensions/pmOldWordsCaret';
import { caretArrowsPlugin } from '$lib/editor/canvas';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import { wholeTableEdits } from '$lib/editor/visual/extensions/table/wholeTableEdits';
import { tabThroughCells } from '$lib/editor/visual/extensions/table/rows/addTableRow';
import { enterInTable } from '$lib/editor/visual/extensions/table/rows/cellEnter';
import { crossBlockEdits } from '$lib/editor/visual/extensions/crossBlockEdits';
import { imagePlugin } from '$lib/editor/visual/extensions/image';
import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
import { wordBeingTypedPlugin } from '$lib/editor/canvas/layout/linebreak/wordBeingTyped';
import { remoteCursorsPlugin } from '$lib/editor/visual/extensions/remoteCursors';
import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
import { latexClipboardPlugin, pasteLatexText } from '$lib/editor/visual/extensions/latexClipboard';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import {
	createListEventPlugin,
	bulletListInputRule,
	orderedListInputRule,
	wrappingListInputRule,
	listKeymap,
	createDedentListCommand
} from 'prosemirror-flat-list';
import { indentListItem } from '$lib/editor/visual/extensions/listIndent/listIndent';
import { inputRules, InputRule, smartQuotes, ellipsis, undoInputRule } from 'prosemirror-inputrules';
import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
import { deleteEmptyBlockBackward, deleteEmptyBlockForward } from '$lib/editor/visual/emptyBlockDelete';
import { liftFromStyleEnvironment } from '$lib/editor/visual/liftFromStyleEnvironment';
import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
import { visualFindPlugin } from '$lib/editor/visual/find/visualFindPlugin';
import { createTocPlugin } from '$lib/editor/visual/extensions/tableofcontents/tocPlugin';
import { createPersistentSelectionPlugin } from '$lib/editor/visual/extensions/persistentSelection/persistentSelectionPlugin';
import { createSuggestPlugin } from '$lib/editor/visual/extensions/suggest/suggestPlugin';
import { proofreadPlugin, spellChipPlugin, spellClickBoundaryPlugin, spellProblemKeymap } from '$lib/editor/spellcheck/spellcheckplugin';
import { typedWordPlugin } from '$lib/editor/spellcheck/proofreadHold';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { createTemplateEditorSettings, createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { latexCropFormat } from '$lib/editor/visual/extensions/image/crop/latexCropFormat';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { latexProse } from '$lib/workspace/wordCount/proseWords';
import { emDashRule, enDashRule, emDashUpgradeRule } from '$lib/editor/visual/extensions/inputrules/dashRules';
import { placeholderCaret } from '$lib/editor/visual/extensions/raw-latex/placeholderCaret';
import { createBlockHandlePlugin } from '$lib/editor/visual/extensions/block-handle-plugin.svelte';
import { blockBarPlugin } from '$lib/editor/visual/extensions/blockBar/blockBarPlugin.svelte';
import { wholeBlockDragPlugin } from '$lib/editor/visual/extensions/wholeBlockDrag';
import { createNodeFlashPlugin } from '$lib/editor/visual/extensions/flash-plugin';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { primarySelectionPlugin } from '$lib/editor/visual/extensions/primarySelection';
import { heldWidthPlugin } from '$lib/editor/visual/extensions/heldWidth';
import { islandKeysPlugin } from '$lib/editor/canvas/islands/islandKeys';
import { islandCompletionPlugin } from '$lib/editor/visual/extensions/raw-latex/completion/islandCompletion';
import { numbersKey, numbersPlugin } from './extensions/numbers/numbersPlugin';
import { unnumberHeading } from '$lib/editor/visual/unnumberHeading';
import { proofEndMarkPlugin } from './extensions/environment/canvas/proofEndMark';
import { onDrawnInputs } from './core/drawnInputs.svelte';
import { chipCounts } from './core/plugin/chipCounts';
import { pluginEditorPlugins } from './core/plugin/editorPieces';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { numberedFilesOf } from '$lib/workspace/document/numberedFiles';
import { createLinkPlugin } from '$lib/editor/visual/extensions/link';
import { pmComments } from '$lib/editor/visual/extensions/pmComments';
import { listRuleWithoutIndent } from './listItemIndent';
import { enterKeepingListEnvironment } from './listEnterKeepsEnvironment';
import type { CommentAnchor } from '$lib/comments/anchor';
import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { labelRenameUndo } from '$lib/editor/visual/repointRefs';
import { macroJumpPlugin } from '$lib/editor/visual/extensions/mathlivebridge/macroArgs/macroJump';
import { mathInputRules } from '$lib/editor/visual/extensions/mathlivebridge/mathInputRule';

export type LatexEditorSetup = {
	/** resolved by the caller's dynamic import so mathlive stays off the critical path */
	mathlivePlugin: Plugin;
	mlarrowHandlers: Plugin;
	imageDir?: () => string;
	placeholder: string;
	onSelectComment?: (id: string) => void;
	onAddComment?: (anchor: CommentAnchor | null) => void;
	/** the selection as a range of the file; see pmComments */
	sourceAnchor?: SourceAnchorFn;
	addCommentLabel: string;
	/** read at each check: the editor's file can change its language */
	spellLanguage: () => SpellLanguage | null;
	jumpToDefinition: (name: string) => void;
	/** the file is the document's main file, so its numbers count from its start */
	isMainFile: () => boolean;
	filePath: () => string | null;
};

export function latexEditorPlugins(setup: LatexEditorSetup): Plugin[] {
	const {
		mathlivePlugin,
		mlarrowHandlers,
		imageDir,
		placeholder,
		onSelectComment,
		onAddComment,
		sourceAnchor,
		addCommentLabel,
		spellLanguage,
		jumpToDefinition,
		isMainFile,
		filePath
	} = setup;
	return [
		parseCarryPlugin,
		islandCompletionPlugin(),
		...pluginEditorPlugins('atStart'),
		macroJumpPlugin(jumpToDefinition),
		labelRenameUndo,
		oldWordsArrowsPlugin(),
		caretArrowsPlugin(),
		heldGapCursor(),
		tableEditing(),
		wholeTableEdits,
		crossBlockEdits,
		// flat-list's clipboard plugin is left out: Texpile's own copy (visualSmartPaste) writes lists as it did
		createListEventPlugin(),
		history(),
		...createSuggestPlugin(),
		drawnChipAtomsPlugin(),
		placeholderCaret,
		primarySelectionPlugin(),
		heldWidthPlugin(),
		islandKeysPlugin(),
		// before the list keymap, whose Backspace and Delete act at a block edge: they would join the block after an empty one into it, and a block into a figure
		keymap({ Backspace: unnumberHeading((state) => numbersKey.getState(state)?.set) }),
		keymap({ Backspace: liftFromStyleEnvironment }),
		keymap({ Backspace: deleteEmptyBlockBackward, Delete: deleteEmptyBlockForward }),
		keymap({ Backspace: selectFigureBackward, Delete: selectFigureForward }),
		keymap({ Enter: enterKeepingListEnvironment }),
		keymap(listKeymap),
		inputRules({
			rules: [
				// a LaTeX list holds bullets and numbers only: a task or toggle item saved as a plain \item
				...[bulletListInputRule, orderedListInputRule].map(({ regexp, getAttrs }) =>
					listRuleWithoutIndent(wrappingListInputRule(regexp, getAttrs))
				),
				...smartQuotes,
				emDashRule,
				enDashRule,
				emDashUpgradeRule,
				ellipsis,
				...mathInputRules('latex')
			] as readonly InputRule[]
		}),
		pmCommandKeys({
			'editor.bold': toggleMark(schema.marks.strong),
			'editor.italic': toggleMark(schema.marks.em),
			'editor.emphasis': toggleMark(schema.marks.em, { cmd: 'emph' }),
			'editor.inlineCode': toggleMark(schema.marks.code),
			'editor.underline': toggleMark(schema.marks.u),
			'editor.superscript': toggleMark(schema.marks.sup),
			'editor.subscript': toggleMark(schema.marks.sub),
			'editor.blockquote': toggleBlockQuote(),
			'editor.codeBlock': createCodeBlock(),
			'editor.heading0': toggleHeading(0),
			'editor.heading1': toggleHeading(1),
			'editor.heading2': toggleHeading(2),
			'editor.heading3': toggleHeading(3),
			'editor.inlineMath': createMathField(),
			'editor.displayMath': createMathField(true)
		}),
		pmEditorScope('latex'),
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
			Enter: (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) =>
				enterInTable(state, dispatch, view) || splitBlockWithoutDuplicates(state, dispatch),
			// table cell, then list nesting (as markdown and typst do), and only outside both does Tab
			// cycle the paragraph indent. Without the list step it wrote \indent into the \item
			// instead of sinking it. always consume Tab so focus stays in the editor
			Tab: (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
				if (tabThroughCells(state, dispatch, view)) return true;
				if (indentListItem()(state, dispatch)) return true;
				cycleParagraphIndent(1)(state, dispatch);
				return true;
			},
			'Shift-Tab': (state: EditorState, dispatch?: (tr: Transaction) => void) => {
				if (goToNextCell(-1)(state, dispatch)) return true;
				if (createDedentListCommand()(state, dispatch)) return true;
				cycleParagraphIndent(-1)(state, dispatch);
				return true;
			}
		}),
		mlarrowHandlers,
		mathlivePlugin,
		keymap(baseKeymap),
		imagePlugin({ ...(imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings()), cropFormat: latexCropFormat }),
		menuUpdatePlugin(),
		createCursorPlugin(),
		wordBeingTypedPlugin(),
		remoteCursorsPlugin,
		createLinkPlugin(),
		visualSmartPaste('latex', schema, pasteLatexText),
		latexClipboardPlugin,
		pasteUuidFixPlugin,
		visualFindPlugin(),
		placeholderPlugin(placeholder),
		tablePlaceholderPlugin(),
		...pluginEditorPlugins('beforeWordCount'),
		createWordCountPlugin((raw) => latexProse(raw, false)),
		createTocPlugin(),
		...pluginEditorPlugins('afterContents'),
		createPersistentSelectionPlugin(),
		spellClickBoundaryPlugin, // must precede proofreadPlugin; see its comment
		proofreadPlugin(spellLanguage),
		typedWordPlugin,
		spellProblemKeymap,
		spellChipPlugin,
		createBlockHandlePlugin(),
		blockBarPlugin(),
		wholeBlockDragPlugin(),
		numbersPlugin({
			context: () => {
				const intel = projectIntelStore.current;
				return {
					anchors: { contents: intel.auxContents, labels: intel.auxNumbers, repeated: intel.auxRepeated },
					scheme: intel.numbering,
					standalone: isMainFile(),
					path: filePath(),
					files: numberedFilesOf(intel.documentFiles, intel.numbering)
				};
			},
			counts: chipCounts,
			onInputs: onDrawnInputs
		}),
		proofEndMarkPlugin(),
		createNodeFlashPlugin(),
		...pmComments({
			onSelect: (id) => onSelectComment?.(id),
			onAdd: onAddComment,
			sourceAnchor,
			addLabel: addCommentLabel
		})
	];
}
