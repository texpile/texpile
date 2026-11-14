// plugin stack and node-view wiring for the LaTeX visual editor; LatexEditorView.svelte mounts it
import { FigureCardView } from '$lib/draw/host/card/FigureCardView.svelte';
import { blockChipView, inlineChipView } from '$lib/languages/latex/visual/extensions/chipViewKind';
import { tikzLanguage } from '$lib/draw/tikz/tikzLanguage';
import type { Plugin } from 'prosemirror-state';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { EditorProps, EditorView } from 'prosemirror-view';
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
import { gapCursorWithArrows } from '$lib/editor/visual/gapArrows';
import { hiddenSelectionPlugin } from '$lib/editor/visual/highlight/hiddenSelection';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { cmarrowHandlers } from '$lib/editor/visual/extensions/codemirrorbridge/cmarrowhandler';
import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
import { dropCursor } from 'prosemirror-dropcursor';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import { tableViewOnly } from '$lib/editor/visual/extensions/table/tableViewOnly';
import { wholeTableEdits } from '$lib/editor/visual/extensions/table/wholeTableEdits';
import { tableArrowEntry } from '$lib/editor/visual/extensions/table/caret/tableArrowEntry';
import { tableArrowExit } from '$lib/editor/visual/extensions/table/caret/tableArrowExit';
import { tabThroughCells } from '$lib/editor/visual/extensions/table/rows/addTableRow';
import { crossBlockEdits } from '$lib/editor/visual/extensions/crossBlockEdits';
import { imagePlugin } from '$lib/editor/visual/extensions/image';
import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
import { lineBreakPlugins } from '$lib/editor/visual/linebreak/lineBreakPlugin';
import { remoteCursorsPlugin } from '$lib/editor/visual/extensions/remoteCursors';
import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
import { latexClipboardPlugin, pasteLatexText } from '$lib/editor/visual/extensions/latexClipboard';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import {
	createListEventPlugin,
	createListRenderingPlugin,
	createSafariInputMethodWorkaroundPlugin,
	listInputRules,
	listKeymap,
	createDedentListCommand
} from 'prosemirror-flat-list';
import { indentListItem } from '$lib/editor/visual/extensions/listIndent/listIndent';
import { inputRules, InputRule, smartQuotes, ellipsis, undoInputRule } from 'prosemirror-inputrules';
import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
import { deleteEmptyBlockForward, deleteEmptyFirstBlock } from '$lib/editor/visual/emptyBlockDelete';
import { liftFromStyleEnvironment } from '$lib/editor/visual/liftFromStyleEnvironment';
import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
import { visualFindPlugin } from '$lib/editor/visual/find/visualFindPlugin';
import { createTocPlugin } from '$lib/editor/visual/extensions/tableofcontents/tocPlugin';
import { createPersistentSelectionPlugin } from '$lib/editor/visual/extensions/persistentSelection/persistentSelectionPlugin';
import { createSuggestPlugin } from '$lib/editor/visual/extensions/suggest/suggestPlugin';
import { proofreadPlugin, spellChipPlugin, spellClickBoundaryPlugin, spellProblemKeymap } from '$lib/editor/spellcheck/spellcheckplugin';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';
import { createTemplateEditorSettings, createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { latexCropFormat } from '$lib/editor/visual/extensions/image/crop/latexCropFormat';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { latexProse } from '$lib/workspace/wordCount/proseWords';
import { emDashRule, enDashRule, emDashUpgradeRule } from '$lib/editor/visual/extensions/inputrules/dashRules';
import { RawFigureView } from '$lib/editor/visual/extensions/raw-latex/rawFigureView';
import { IeeeAuthorView } from '$lib/languages/latex/visual/extensions/template-specific/ieeeAuthorView';
import { InlinePlaceholderView } from '$lib/editor/visual/extensions/raw-latex/inlinePlaceholderView';
import { PlaceholderRawView } from '$lib/editor/visual/extensions/raw-latex/placeholderView';
import { placeholderCaret } from '$lib/editor/visual/extensions/raw-latex/placeholderCaret';
import { BibliographyNodeView } from '$lib/editor/visual/extensions/bibliography/bibliographyNodeView.svelte';
import { environmentView } from '$lib/languages/latex/visual/extensions/environment/environmentView.svelte';
import { createBoundaryClickPlugin } from '$lib/editor/visual/extensions/boundary-click-plugin';
import { wordSelectionTrim } from '$lib/editor/visual/extensions/wordSelectionTrim';
import { unfocusedPressCaret } from '$lib/editor/visual/extensions/unfocusedPress';
import { dragSelectionPlugin } from '$lib/editor/visual/extensions/dragSelection/dragSelectionPlugin';
import { createBlockHandlePlugin } from '$lib/editor/visual/extensions/block-handle-plugin.svelte';
import { wholeBlockDragPlugin } from '$lib/editor/visual/extensions/wholeBlockDrag';
import { dropPastNodeViewsPlugin } from '$lib/editor/visual/extensions/dropPastNodeViews';
import { createNodeFlashPlugin } from '$lib/editor/visual/extensions/flash-plugin';
import { drawnOrSource } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { shiftArrowsPlugin } from '$lib/editor/visual/extensions/shiftArrows/shiftArrowsPlugin';
import { latexChipKind } from '$lib/languages/latex/visual/extensions/latexChipKind';
import { numbersPlugin } from './extensions/numbers/numbersPlugin';
import { onDrawnInputs } from './core/drawnInputs.svelte';
import { chipCounts } from './core/plugin/chipCounts';
import { pluginEditorPlugins, pluginNodeViews } from './core/plugin/editorPieces';
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
import { m } from '$lib/paraglide/messages';

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
		...pluginEditorPlugins('atStart'),
		macroJumpPlugin(jumpToDefinition),
		labelRenameUndo,
		gapCursorWithArrows(),
		hiddenSelectionPlugin(),
		// drop cursor is inline-styled (not CSS-targetable) and its default black vanishes on dark
		dropCursor({ color: 'var(--color-primary-500)', width: 2, class: 'pm-drop-cursor' }),
		// TableView without the drag: a LaTeX column width lives in the colspec and only exists
		// for p{}/tabularx columns, so a dragged l/c/r column had nowhere to be written and was
		// discarded on the next parse. See tableViewOnly.
		tableViewOnly,
		tableArrowExit,
		tableEditing(),
		wholeTableEdits,
		tableArrowEntry,
		crossBlockEdits,
		// flat-list's clipboard plugin is left out: Texpile's own copy (visualSmartPaste) writes lists as it did
		createListEventPlugin(),
		createListRenderingPlugin(),
		createSafariInputMethodWorkaroundPlugin(),
		history(),
		...createSuggestPlugin(),
		drawnChipAtomsPlugin(),
		placeholderCaret,
		shiftArrowsPlugin(),
		// before the list keymap, whose Backspace and Delete act at a block edge: they would join the block after an empty one into it, and a block into a figure
		keymap({ Backspace: liftFromStyleEnvironment }),
		keymap({ Backspace: deleteEmptyFirstBlock, Delete: deleteEmptyBlockForward }),
		keymap({ Backspace: selectFigureBackward, Delete: selectFigureForward }),
		keymap({ Enter: enterKeepingListEnvironment }),
		keymap(listKeymap),
		inputRules({
			rules: [
				...listInputRules.map(listRuleWithoutIndent),
				...smartQuotes,
				emDashRule,
				enDashRule,
				emDashUpgradeRule,
				ellipsis
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
			Enter: splitBlockWithoutDuplicates,
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
		cmarrowHandlers,
		mlarrowHandlers,
		mathlivePlugin,
		keymap(baseKeymap),
		imagePlugin({ ...(imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings()), cropFormat: latexCropFormat }),
		menuUpdatePlugin(),
		createCursorPlugin(),
		...lineBreakPlugins(),
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
		spellProblemKeymap,
		spellChipPlugin,
		createBoundaryClickPlugin(),
		wordSelectionTrim(),
		unfocusedPressCaret(),
		dragSelectionPlugin(),
		createBlockHandlePlugin(),
		wholeBlockDragPlugin(),
		dropPastNodeViewsPlugin(),
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
		createNodeFlashPlugin(),
		...pmComments({
			onSelect: (id) => onSelectComment?.(id),
			onAdd: onAddComment,
			sourceAnchor,
			addLabel: addCommentLabel
		})
	];
}

// PM types getPos as possibly undefined (unmounted), but these views only call it while
// mounted, so cast instead of threading the optionality through every constructor
export function latexNodeViews(
	imageDir: () => string,
	onJumpToLabel?: (name: string) => boolean,
	onJumpToDefinition?: (name: string) => boolean
): NonNullable<EditorProps['nodeViews']> {
	return {
		raw_latex: (node, view, getPos, decorations) => {
			const at = getPos as () => number;
			switch (blockChipView(node.textContent)) {
				case 'bibliography':
					return new BibliographyNodeView(node, view, at);
				case 'placeholder':
					return new PlaceholderRawView(node, view, at);
				case 'ieee-author':
					return new IeeeAuthorView(node, view, at);
				case 'figure-card':
					return new FigureCardView(node, view, at, tikzLanguage, m.figure_card_tikz(), true);
				case 'raw-figure':
					return new RawFigureView(node, view, at, imageDir);
				default:
					return drawnOrSource(node, view, at, decorations, latexChipKind(view, true, onJumpToLabel, onJumpToDefinition));
			}
		},
		inline_latex: (node, view, getPos, decorations) =>
			inlineChipView(node.textContent) === 'placeholder'
				? new InlinePlaceholderView(node, view, getPos as () => number)
				: drawnOrSource(node, view, getPos as () => number, decorations, latexChipKind(view, false, onJumpToLabel, onJumpToDefinition)),
		environment: environmentView,
		...pluginNodeViews({ imageDir, onJumpToLabel, onJumpToDefinition })
	};
}
