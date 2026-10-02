// plugin stack, autoformat rules, paste handling, and node views for the Typst visual editor;
// TypstEditorView.svelte mounts it
import { Plugin } from 'prosemirror-state';
import type { EditorProps, EditorView } from 'prosemirror-view';
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { typstToProseMirror } from './convert/converter';
import { typstCopyPlugin } from './clipboard';
import { parseCarryPlugin } from '$lib/editor/visual/parseCarry';
import { labelRenameUndo } from '$lib/editor/visual/repointRefs';
import { createSuggestPlugin } from '$lib/editor/visual/extensions/suggest/suggestPlugin';
import { selectAllScoped } from '$lib/editor/visual/selectAllScoped';
import { selectDocStart, selectDocEnd } from '$lib/editor/visual/selectDocBoundary';
import { TypstBibliographyView, isTypstBibliography } from './extensions/typstBibliographyView.svelte';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { undo as historyUndo, redo as historyRedo, history } from 'prosemirror-history';
import { gapCursor } from 'prosemirror-gapcursor';
import { dropCursor } from 'prosemirror-dropcursor';
import { tableEditing, goToNextCell } from 'prosemirror-tables';
import { wholeTableEdits } from '$lib/editor/visual/extensions/table/wholeTableEdits';
import { crossBlockEdits } from '$lib/editor/visual/extensions/crossBlockEdits';
import { columnResizing } from '$lib/editor/visual/extensions/table/columnResizing';
import { snapWidthToFr } from '$lib/editor/visual/extensions/table/snapWidth';
import { captureColumnWidths } from '$lib/editor/visual/extensions/table/captureColumnWidths';
import {
	createListPlugins,
	listKeymap,
	createIndentListCommand,
	createDedentListCommand,
	wrappingListInputRule,
	type ListAttributes
} from 'prosemirror-flat-list';
import { inputRules, textblockTypeInputRule, InputRule, undoInputRule, smartQuotes, ellipsis } from 'prosemirror-inputrules';
import { selectFigureBackward, selectFigureForward } from '$lib/editor/visual/figureDeleteGuard';
import { deleteEmptyBlockForward, deleteEmptyFirstBlock } from '$lib/editor/visual/emptyBlockDelete';
import { emDashRule, enDashRule, emDashUpgradeRule } from '$lib/editor/visual/extensions/inputrules/dashRules';
import { search } from 'prosemirror-search';
import { typSchema } from './schema';
import { TypstRefView } from './extensions/ref/typstRefView.svelte';
import { typstEnvView } from './extensions/env/typstEnvView.svelte';
import { TYP_BLOCK_INSERT_ITEMS } from './blockInsertItems';
import { isMac } from '$lib/platform';
import { splitHeadingWithoutDuplicates, toggleHeading } from '$lib/editor/visual/helperCommands';
import { createMathField } from '$lib/editor/visual/extensions/mathlivebridge/mlcommands';
import { imagePlugin } from '$lib/editor/visual/extensions/image';
import { createTypstImageSettings } from './imageSettings.svelte';
import { createCodeBlock } from '$lib/editor/visual/extensions/codemirrorbridge/cmcommands';
import { cmarrowHandlers } from '$lib/editor/visual/extensions/codemirrorbridge/cmarrowhandler';
import { menuUpdatePlugin } from '$lib/editor/visual/extensions/toolbarlistenerplugin';
import { createCursorPlugin } from '$lib/editor/visual/extensions/cursor-plugin';
import { lineBreakPlugins } from '$lib/editor/visual/linebreak/lineBreakPlugin';
import { createLinkPlugin } from '$lib/editor/visual/extensions/link';
import { pasteUuidFixPlugin } from '$lib/editor/visual/extensions/paste-uuid-fix';
import { visualSmartPaste } from '$lib/editor/paste/visualSmartPaste';
import { pasteReadingOfText } from '$lib/editor/paste/pasteReadingOfText';
import { placeholderPlugin } from '$lib/editor/visual/extensions/placeholderplugin';
import { tablePlaceholderPlugin } from '$lib/editor/visual/extensions/table/tablePlaceholderPlugin';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { typstProse } from '$lib/workspace/wordCount/proseWords';
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
import { CodeBlockView } from '$lib/editor/visual/extensions/codemirrorbridge/cmview.svelte';
import { typstTableWrapperView } from '$lib/editor/visual/extensions/table/tableWrapperView.svelte';
import { drawnOrSource } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { drawnChipAtomsPlugin } from '$lib/editor/visual/extensions/drawnChips/drawnChipAtoms';
import { typstChipKind } from './extensions/typstChipKind';
import { footnoteNumbersPlugin } from '$lib/editor/visual/extensions/drawnChips/footnoteNumbers';
import { typstFootnoteMarks } from './extensions/drawn/footnoteCall';
import { IncludeDocView } from '$lib/editor/visual/extensions/includedoc/includeDocView.svelte';
import { pmComments } from '$lib/editor/visual/extensions/pmComments';
import type { CommentAnchor } from '$lib/comments/anchor';
import type { SourceAnchorFn } from '$lib/editor/visual/extensions/pmComments';

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
	emDashUpgradeRule
];

// Pasted TYPST SOURCE becomes rich nodes - the typst counterpart of the latex clipboard.
// Gated on structural markers so ordinary prose still pastes as plain text. The parse knows
// nothing of this document, so the pasted blocks carry no origins and are always written out afresh.
function pasteTypstSource(view: EditorView, text: string): boolean {
	if (!/(^|\n)(={1,6} |[-+] |\/ |```|#[a-zA-Z])|\*[^\s*][^*]*\*|_[^\s_][^_]*_/.test(text)) return false;
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
			return pasteTypstSource(view, text);
		}
	}
});

export type TypstEditorSetup = {
	/** resolved by the caller's dynamic import so mathlive stays off the critical path */
	mathlivePlugin: Plugin;
	mlarrowHandlers: Plugin;
	docDir: () => string;
	placeholder: string;
	onHistoryBoundary?: (dir: 'undo' | 'redo') => boolean;
	onOpenLink?: (href: string) => boolean;
	onSelectComment?: (id: string) => void;
	onAddComment?: (anchor: CommentAnchor | null) => void;
	/** the selection as a range of the file; see pmComments */
	sourceAnchor?: SourceAnchorFn;
	addCommentLabel: string;
};

export function typstEditorPlugins(setup: TypstEditorSetup): Plugin[] {
	const {
		mathlivePlugin,
		mlarrowHandlers,
		docDir,
		placeholder,
		onHistoryBoundary,
		onOpenLink,
		onSelectComment,
		onAddComment,
		sourceAnchor,
		addCommentLabel
	} = setup;
	return [
		parseCarryPlugin,
		labelRenameUndo,
		typstCopyPlugin,
		gapCursor(),
		dropCursor({ color: 'var(--color-primary-500)', width: 2, class: 'pm-drop-cursor' }),
		// Typst is the one dialect where a drag can be saved: `columns:` takes real lengths and
		// fr. The drag snaps to that same grid (vendored columnResizing + snapWidthToFr);
		// captureColumnWidths fills in the columns a drag leaves unsized, which is what
		// the serializer needs to emit proportions instead of one fr beside two autos.
		columnResizing({ snap: snapWidthToFr, redistribute: true }),
		captureColumnWidths,
		tableEditing(),
		wholeTableEdits,
		crossBlockEdits,
		visualSmartPaste('typst', typSchema, pasteTypstSource),
		pasteTypstPlugin,
		...createListPlugins({ schema: typSchema }),
		history(),
		// the @ reference/citation popup; its arrow/enter keymap must precede the others.
		// The picker inserts typ_ref atoms (it keys off the mounted schema)
		...createSuggestPlugin(),
		drawnChipAtomsPlugin(),
		// before the list keymap, whose Backspace and Delete act at a block edge: they would join the block after an empty one into it, and a block into a figure
		keymap({ Backspace: deleteEmptyFirstBlock, Delete: deleteEmptyBlockForward }),
		keymap({ Backspace: selectFigureBackward, Delete: selectFigureForward }),
		keymap(listKeymap),
		inputRules({ rules: typInputRules }),
		keymap({
			// PM history first, then the workspace snapshot history (survives mode switches)
			'Mod-z': (state, dispatch) => historyUndo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('undo'), true) : false),
			'Mod-y': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
			'Mod-Shift-z': (state, dispatch) => historyRedo(state, dispatch) || (onHistoryBoundary ? (onHistoryBoundary('redo'), true) : false),
			Backspace: undoInputRule,
			'Mod-a': selectAllScoped,
			'Mod-Home': selectDocStart,
			'Mod-End': selectDocEnd,
			'Mod-b': toggleMark(typSchema.marks.strong),
			'Mod-i': toggleMark(typSchema.marks.em),
			'Mod-u': toggleMark(typSchema.marks.u),
			'Mod-.': toggleMark(typSchema.marks.sup),
			'Mod-Shift-,': toggleMark(typSchema.marks.sub), // Mod-, is Preferences
			'Mod-`': toggleMark(typSchema.marks.code),
			'Mod-Shift-`': createCodeBlock(),
			Enter: splitHeadingWithoutDuplicates,
			'Mod-m': createMathField(),
			'Mod-Shift-m': createMathField(true),
			// Word/Docs convention, same as the other editors; typst headings nest to six
			'Mod-Alt-0': toggleHeading(0),
			...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`Mod-Alt-${n}`, toggleHeading(n)])),
			...(isMac ? {} : { 'Mod-Shift-1': toggleHeading(1), 'Mod-Shift-2': toggleHeading(2), 'Mod-Shift-3': toggleHeading(3) }),
			// table cell first, then list indent; always consume so focus stays in the editor
			Tab: (state, dispatch) => goToNextCell(1)(state, dispatch) || createIndentListCommand()(state, dispatch) || true,
			'Shift-Tab': (state, dispatch) => goToNextCell(-1)(state, dispatch) || createDedentListCommand()(state, dispatch) || true
		}),
		cmarrowHandlers,
		mlarrowHandlers,
		mathlivePlugin,
		keymap(baseKeymap),
		imagePlugin(createTypstImageSettings(docDir)),
		menuUpdatePlugin(),
		createCursorPlugin(),
		...lineBreakPlugins(),
		createLinkPlugin({ onOpen: onOpenLink }),
		pasteUuidFixPlugin,
		search(),
		placeholderPlugin(placeholder),
		tablePlaceholderPlugin(),
		createWordCountPlugin(typstProse),
		createTocPlugin(),
		createPersistentSelectionPlugin(),
		spellClickBoundaryPlugin, // must precede proofreadPlugin; see its comment
		proofreadPlugin,
		spellProblemKeymap,
		createBoundaryClickPlugin(),
		wordSelectionTrim(),
		dragSelectionPlugin(),
		// the Notion-style + / drag / delete gutter, with the typst insert set
		createBlockHandlePlugin({ items: TYP_BLOCK_INSERT_ITEMS }),
		wholeBlockDragPlugin(),
		dropPastNodeViewsPlugin(),
		footnoteNumbersPlugin(typstFootnoteMarks),
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

export function typstNodeViews(docDir: () => string): NonNullable<EditorProps['nodeViews']> {
	return {
		code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos as () => number),
		// typst raw islands are the safety valve for everything unmodeled: plain CM views
		// (highlighting picked by attrs.lang), never a latex-specialized node view. The dressed-up
		// ones keep their text verbatim: #bibliography as a card, a comment folded to a line
		raw_latex: (node, view, getPos, decorations) =>
			isTypstBibliography(node.textContent)
				? new TypstBibliographyView(node, view, getPos as () => number)
				: drawnOrSource(node, view, getPos as () => number, decorations, typstChipKind(true)),
		inline_latex: (node, view, getPos, decorations) => drawnOrSource(node, view, getPos as () => number, decorations, typstChipKind(false)),
		includedoc: (node, view, getPos) => new IncludeDocView(node, view, getPos as () => number, docDir),
		// the shared table wrapper chrome (Table N header, gear with label + verbatim columns)
		// in typst mode: every LaTeX-only control is gated off inside
		table_wrapper: (node, view, getPos) => typstTableWrapperView(node, view, getPos as () => number),
		typ_ref: (node, view, getPos) => new TypstRefView(node, view, getPos),
		typ_env: (node, view, getPos) => typstEnvView(node, view, getPos)
	};
}
