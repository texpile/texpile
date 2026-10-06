// Ctrl+Home / Ctrl+End, and with Shift, bound rather than left to the browser.
import { Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { gapCursorAt } from './gapSelection';
import { docEdgeCaret, takesCaret } from './extensions/shiftArrows/caretBlocks';

/**
 * contenteditable needs a TEXT position it can edit to land on. A paper starts on \maketitle and
 * ends on `\bibliography{refs}`, raw blocks that take no caret: left to the browser Ctrl+End did
 * nothing, and Selection.atEnd alone puts the caret inside the block, which the browser then moves
 * to the first line of the document. Past such a block the caret is a gap cursor.
 */
function docEdge(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean => {
		const { doc } = state;
		const edge = dir > 0 ? Selection.atEnd(doc) : Selection.atStart(doc);
		const editable = edge instanceof TextSelection && view && takesCaret(view, edge.$head.before());
		const sel = editable ? edge : (gapCursorAt(doc.resolve(dir > 0 ? doc.content.size : 0)) ?? edge);
		dispatch?.(state.tr.setSelection(sel).scrollIntoView());
		return true;
	};
}

/** the selection to the start or end of the first or last block that takes a caret */
function extendToEdge(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean => {
		const head = (view && docEdgeCaret(view, dir)) ?? (dir > 0 ? Selection.atEnd(state.doc) : Selection.atStart(state.doc)).head;
		dispatch?.(state.tr.setSelection(TextSelection.between(state.selection.$anchor, state.doc.resolve(head))).scrollIntoView());
		return true;
	};
}

export const selectDocStart = docEdge(-1);
export const selectDocEnd = docEdge(1);
export const extendToDocStart = extendToEdge(-1);
export const extendToDocEnd = extendToEdge(1);
