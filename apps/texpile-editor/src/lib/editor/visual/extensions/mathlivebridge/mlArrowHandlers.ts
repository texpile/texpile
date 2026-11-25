// the word keys and the delete keys beside an inline formula (T18): it is stepped over or extended over as one unit, and
// entered by a delete. Left and Right are the caret engine's

import { keydownHandler } from 'prosemirror-keymap';
import { isMac } from '$lib/platform';
import { NodeSelection, Plugin, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';

// prosemirror only steps a shift selection over leaf atoms and math holds text, so the browser got the key and stalled at the field
function mlShiftArrowHandler(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const sel = state.selection;
		if (!(sel instanceof TextSelection)) return false;
		const { $head } = sel;
		const node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
		if (node?.type.name !== 'inline_math') return false;
		dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, sel.anchor, $head.pos + dir * node.nodeSize)));
		return true;
	};
}

// a word key takes the math as one word, as LyX's does an inset: ProseMirror would select it, and so enter it
function mlWordArrowHandler(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const sel = state.selection;
		if (!(sel instanceof TextSelection) || !sel.empty) return false;
		const { $head } = sel;
		const node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
		if (node?.type.name !== 'inline_math') return false;
		dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, $head.pos + dir * node.nodeSize)));
		return true;
	};
}

// as LyX, Backspace or Delete beside a formula goes into it first, where one key took the whole formula
function mlDeleteHandler(dir: -1 | 1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const sel = state.selection;
		if (!(sel instanceof TextSelection) || !sel.empty) return false;
		const { $head } = sel;
		const node = $head.textOffset ? null : dir < 0 ? $head.nodeBefore : $head.nodeAfter;
		if (node?.type.name !== 'inline_math') return false;
		dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, dir < 0 ? $head.pos - node.nodeSize : $head.pos)));
		return true;
	};
}

const word = isMac ? 'Alt' : 'Ctrl';
const horizontalArrowKeyDown = keydownHandler({
	[`${word}-ArrowRight`]: mlWordArrowHandler(1),
	[`${word}-ArrowLeft`]: mlWordArrowHandler(-1),
	[`Shift-${word}-ArrowRight`]: mlShiftArrowHandler(1),
	[`Shift-${word}-ArrowLeft`]: mlShiftArrowHandler(-1),
	Backspace: mlDeleteHandler(-1),
	Delete: mlDeleteHandler(1)
});

/** must come before the regular keymap in plugin order. */
export const mlarrowHandlers = new Plugin({
	props: {
		handleKeyDown: (view, event) => horizontalArrowKeyDown(view, event)
	}
});
