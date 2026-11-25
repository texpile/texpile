// Ctrl+Home / Ctrl+End, and with Shift: the caret engine's first or last stop of the document
import { Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { GapCursor } from 'prosemirror-gapcursor';
import { documentStop, selectionOfStop, type VisualView } from '$lib/editor/canvas';

/** the document's first or last stop: a caret, a block drawn whole selected (\maketitle), or a gap past one */
function docEdge(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean => {
		const stop = view && documentStop(view as unknown as VisualView, -dir as -1 | 1);
		const sel = stop
			? selectionOfStop(view as unknown as VisualView, stop)
			: dir > 0
				? Selection.atEnd(state.doc)
				: Selection.atStart(state.doc);
		dispatch?.(state.tr.setSelection(sel).scrollIntoView());
		return true;
	};
}

/** the selection to the start or end of the first or last block that takes a caret */
function extendToEdge(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean => {
		const stop = view && documentStop(view as unknown as VisualView, -dir as -1 | 1, { extend: true, enterTables: true });
		const head = stop?.pos ?? (dir > 0 ? Selection.atEnd(state.doc) : Selection.atStart(state.doc)).head;
		dispatch?.(state.tr.setSelection(TextSelection.between(state.selection.$anchor, state.doc.resolve(head))).scrollIntoView());
		return true;
	};
}

export const selectDocStart = docEdge(-1);
export const selectDocEnd = docEdge(1);
export const extendToDocStart = extendToEdge(-1);
export const extendToDocEnd = extendToEdge(1);

function holdAtEdge(dir: -1 | 1) {
	return (state: EditorState): boolean => {
		const { selection, doc } = state;
		return selection instanceof GapCursor && selection.head === (dir > 0 ? doc.content.size : 0);
	};
}

export const holdAtDocStart = holdAtEdge(-1);
export const holdAtDocEnd = holdAtEdge(1);
