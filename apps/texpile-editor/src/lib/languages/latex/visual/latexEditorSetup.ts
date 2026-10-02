// plugin stack and node-view wiring for the LaTeX visual editor; LatexEditorView.svelte mounts it
import type { Plugin } from 'prosemirror-state';
import { EditorState, type Transaction } from 'prosemirror-state';
import type { EditorProps } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { isMac } from '$lib/platform';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { undo as historyUndo, redo as historyRedo, history } from 'prosemirror-history';
import { toggleBlockQuote, toggleHeading, cycleParagraphIndent, splitBlockWithoutDuplicates } from '$lib/editor/visual/helperCommands';
import { selectAllScoped } from '$lib/editor/visual/selectAllScoped';
import { selectDocStart, selectDocEnd } from '$lib/editor/visual/selectDocBoundary';
import { gapCursor } from 'prosemirror-gapcursor';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { cmarrowHandlers } from '$lib/editor/visual/extensions/codemirrorbridge/cmarrowhandler';
import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
import { dropCursor } from 'prosemirror-dropcursor';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import { tableViewOnly } from '$lib/editor/visual/extensions/table/tableViewOnly';
import { wholeTableEdits } from '$lib/editor/visual/extensions/table/wholeTableEdits';
import { crossBlockEdits } from '$lib/editor/visual/extensions/crossBlockEdits';
import { imagePlugin } from '$lib/editor/visual/extensions/image';
import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
import { lineBreakPlugins } from '$lib/editor/visual/linebreak/lineBreakPlugin';
import { remoteCursorsPlugin } from '$lib/editor/visual/extensions/remoteCursors';
import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
import { latexClipboardPlugin, pasteLatexText } from '$lib/editor/visual/extensions/latexClipboard';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { createListPlugins, listInputRules, listKeymap, createIndentListCommand, createDedentListCommand } from 'prosemirror-flat-list';
import { inputRules, InputRule, smartQuotes, ellipsis, undoInputRule } from 'prosemirror-inputrules';
import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
import { deleteEmptyBlockForward, deleteEmptyFirstBlock } from '$lib/editor/visual/emptyBlockDelete';
import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
import { search } from 'prosemirror-search';
import { CitationView } from '$lib/languages/latex/visual/extensions/citation/citationView.svelte';
import { RefView } from '$lib/languages/latex/visual/extensions/ref/refView.svelte';
import { LabelView } from '$lib/languages/latex/visual/extensions/label/labelView.svelte';
import { createTocPlugin } from '$lib/editor/visual/extensions/tableofcontents/tocPlugin';
import { createPersistentSelectionPlugin } from '$lib/editor/visual/extensions/persistentSelection/persistentSelectionPlugin';
import { createSuggestPlugin } from '$lib/editor/visual/extensions/suggest/suggestPlugin';
import { proofreadPlugin, spellChipPlugin, spellClickBoundaryPlugin, spellProblemKeymap } from '$lib/editor/spellcheck/spellcheckplugin';
import { createTemplateEditorSettings, createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { latexProse } from '$lib/workspace/wordCount/proseWords';
import { emDashRule, enDashRule, emDashUpgradeRule } from '$lib/editor/visual/extensions/inputrules/dashRules';
import { tableWrapperView } from '$lib/editor/visual/extensions/table/tableWrapperView.svelte';
import { CodeBlockView } from '$lib/editor/visual/extensions/codemirrorbridge/cmview.svelte';
import { RawFigureView, isRawFigure } from '$lib/editor/visual/extensions/raw-latex/rawFigureView';
import { IeeeAuthorView, isIeeeAuthorBlock } from '$lib/languages/latex/visual/extensions/template-specific/ieeeAuthorView';
import { inlinePlaceholder, InlinePlaceholderView } from '$lib/editor/visual/extensions/raw-latex/inlinePlaceholderView';
import {
	FrontmatterRawView,
	simpleFrontmatter,
	PlaceholderRawView,
	placeholderCommand
} from '$lib/editor/visual/extensions/raw-latex/frontmatterView';
import { BibliographyNodeView } from '$lib/editor/visual/extensions/bibliography/bibliographyNodeView.svelte';
import { environmentView } from '$lib/languages/latex/visual/extensions/environment/environmentView.svelte';
import { IncludeDocView } from '$lib/editor/visual/extensions/includedoc/includeDocView.svelte';
import { createBoundaryClickPlugin } from '$lib/editor/visual/extensions/boundary-click-plugin';
import { wordSelectionTrim } from '$lib/editor/visual/extensions/wordSelectionTrim';
import { dragSelectionPlugin } from '$lib/editor/visual/extensions/dragSelection/dragSelectionPlugin';
import { createBlockHandlePlugin } from '$lib/editor/visual/extensions/block-handle-plugin.svelte';
import { wholeBlockDragPlugin } from '$lib/editor/visual/extensions/wholeBlockDrag';
import { dropPastNodeViewsPlugin } from '$lib/editor/visual/extensions/dropPastNodeViews';
import { createNodeFlashPlugin } from '$lib/editor/visual/extensions/flash-plugin';
import { drawnOrSource } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { latexChipKind } from '$lib/languages/latex/visual/extensions/drawn/latexChipKind';
import { footnoteNumbersPlugin } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { latexFootnoteMarks } from '$lib/languages/latex/visual/extensions/drawn/latexFootnoteMarks';
import { createLinkPlugin } from '$lib/editor/visual/extensions/link';
import { pmComments } from '$lib/editor/visual/extensions/pmComments';
import { listRuleWithoutIndent } from './listItemIndent';
import type { CommentAnchor } from '$lib/comments/anchor';
import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { labelRenameUndo } from '$lib/editor/visual/repointRefs';

export type LatexEditorSetup = {
	/** resolved by the caller's dynamic import so mathlive stays off the critical path */
	mathlivePlugin: Plugin;
	mlarrowHandlers: Plugin;
	imageDir?: () => string;
	placeholder: string;
	onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
	onSelectComment?: (id: string) => void;
	onAddComment?: (anchor: CommentAnchor | null) => void;
	/** the selection as a range of the file; see pmComments */
	sourceAnchor?: SourceAnchorFn;
	addCommentLabel: string;
};

export function latexEditorPlugins(setup: LatexEditorSetup): Plugin[] {
	const {
		mathlivePlugin,
		mlarrowHandlers,
		imageDir,
		placeholder,
		onHistoryBoundary,
		onSelectComment,
		onAddComment,
		sourceAnchor,
		addCommentLabel
	} = setup;
	return [
		parseCarryPlugin,
		labelRenameUndo,
		gapCursor(),
		// drop cursor is inline-styled (not CSS-targetable) and its default black vanishes on dark
		dropCursor({ color: 'var(--color-primary-500)', width: 2, class: 'pm-drop-cursor' }),
		// TableView without the drag: a LaTeX column width lives in the colspec and only exists
		// for p{}/tabularx columns, so a dragged l/c/r column had nowhere to be written and was
		// discarded on the next parse. See tableViewOnly.
		tableViewOnly,
		tableEditing(),
		wholeTableEdits,
		crossBlockEdits,
		...createListPlugins({ schema }),
		history(),
		...createSuggestPlugin(),
		drawnChipAtomsPlugin(),
		// before the list keymap, whose Backspace and Delete act at a block edge: they would join the block after an empty one into it, and a block into a figure
		keymap({ Backspace: deleteEmptyFirstBlock, Delete: deleteEmptyBlockForward }),
		keymap({ Backspace: selectFigureBackward, Delete: selectFigureForward }),
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
		keymap({
			// PM history first, then the workspace snapshot history (survives mode switches).
			// consume the key even at the stack edge so the browser's native undo can't fire.
			'Mod-z': (state, dispatch) => historyUndo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('undo'), true) : false),
			'Mod-y': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
			'Mod-Shift-z': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
			Backspace: undoInputRule,
			'Mod-a': selectAllScoped,
			'Mod-Home': selectDocStart,
			'Mod-End': selectDocEnd,
			'Mod-b': toggleMark(schema.marks.strong),
			'Mod-i': toggleMark(schema.marks.em),
			'Mod-`': toggleMark(schema.marks.code),
			'Mod-u': toggleMark(schema.marks.u),
			'Mod-.': toggleMark(schema.marks.sup),
			'Mod-Shift-,': toggleMark(schema.marks.sub), // Mod-, is Preferences, as in every desktop app
			'Mod-Shift-b': toggleBlockQuote(),
			'Mod-Shift-`': createCodeBlock(),
			// Word/Docs convention (and source mode's own \section shortcuts): Mod-Alt-N on every
			// platform, Mod-Alt-0 back to paragraph. On AltGr layouts where Ctrl+Alt+digit types a
			// character the binding never fires (the key name differs), so Windows keeps the old
			// Mod-Shift-N as a fallback. Mac never had Shift variants (Cmd+Shift+3/4/5 = screenshots).
			'Mod-Alt-0': toggleHeading(0),
			'Mod-Alt-1': toggleHeading(1),
			'Mod-Alt-2': toggleHeading(2),
			'Mod-Alt-3': toggleHeading(3),
			...(isMac ? {} : { 'Mod-Shift-1': toggleHeading(1), 'Mod-Shift-2': toggleHeading(2), 'Mod-Shift-3': toggleHeading(3) }),
			Enter: splitBlockWithoutDuplicates,
			'Mod-m': createMathField(),
			'Mod-Shift-m': createMathField(true),
			// table cell, then list nesting (as markdown and typst do), and only outside both does Tab
			// cycle the paragraph indent. Without the list step it wrote \indent into the \item
			// instead of sinking it. always consume Tab so focus stays in the editor
			Tab: (state: EditorState, dispatch?: (tr: Transaction) => void) => {
				if (goToNextCell(1)(state, dispatch)) return true;
				if (createIndentListCommand()(state, dispatch)) return true;
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
		imagePlugin(imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings()),
		menuUpdatePlugin(),
		createCursorPlugin(),
		...lineBreakPlugins(),
		remoteCursorsPlugin,
		createLinkPlugin(),
		visualSmartPaste('latex', schema, pasteLatexText),
		latexClipboardPlugin,
		pasteUuidFixPlugin,
		search(),
		placeholderPlugin(placeholder),
		tablePlaceholderPlugin(),
		createWordCountPlugin((raw) => latexProse(raw, false)),
		createTocPlugin(),
		createPersistentSelectionPlugin(),
		spellClickBoundaryPlugin, // must precede proofreadPlugin; see its comment
		proofreadPlugin,
		spellProblemKeymap,
		spellChipPlugin,
		createBoundaryClickPlugin(),
		wordSelectionTrim(),
		dragSelectionPlugin(),
		createBlockHandlePlugin(),
		wholeBlockDragPlugin(),
		dropPastNodeViewsPlugin(),
		footnoteNumbersPlugin(latexFootnoteMarks),
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
		code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos as () => number),
		raw_latex: (node, view, getPos, decorations) =>
			simpleFrontmatter(node.textContent)
				? new FrontmatterRawView(node, view, getPos as () => number)
				: placeholderCommand(node.textContent)?.command === 'printbibliography'
					? new BibliographyNodeView(node, view, getPos as () => number)
					: placeholderCommand(node.textContent)
						? new PlaceholderRawView(node, view, getPos as () => number)
						: isIeeeAuthorBlock(node.textContent)
							? new IeeeAuthorView(node, view, getPos as () => number)
							: isRawFigure(node.textContent)
								? new RawFigureView(node, view, getPos as () => number, imageDir)
								: drawnOrSource(
										node,
										view,
										getPos as () => number,
										decorations,
										latexChipKind(view, true, onJumpToLabel, onJumpToDefinition)
									),
		inline_latex: (node, view, getPos, decorations) =>
			inlinePlaceholder(node.textContent)
				? new InlinePlaceholderView(node, view, getPos as () => number)
				: drawnOrSource(node, view, getPos as () => number, decorations, latexChipKind(view, false, onJumpToLabel, onJumpToDefinition)),
		includedoc: (node, view, getPos) => new IncludeDocView(node, view, getPos as () => number, imageDir),
		environment: environmentView,
		table_wrapper: tableWrapperView,
		citation: (node, view, getPos) => new CitationView(node, view, getPos as () => number),
		ref: (node, view) => new RefView(node, view, onJumpToLabel),
		label: (node, view, getPos) => new LabelView(node, view, getPos as () => number)
	};
}
