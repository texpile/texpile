import { keymap } from 'prosemirror-keymap';
import { Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

// the inline nodes a CodeMirror is built into, which the caret should land inside rather than skip
const INLINE_CM = new Set(['inline_latex']);

/**
 * Steps the caret INTO an adjacent inline chip, landing on the side it arrived from: a left arrow
 * from the chip's right puts the caret at the end of its source, the way it does for inline maths.
 *
 * The chip's DOM is uneditable, since CodeMirror owns what is inside it, so the browser cannot walk
 * a caret in and ProseMirror steps around the whole node. Naming a text position inside hands it to
 * the node view's setSelection, which is where CodeMirror gets built and focused.
 */
export function enterInlineCm(dir: 1 | -1) {
	return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
		const { $from, empty } = state.selection;
		if (!empty) return false;
		const chip = dir > 0 ? $from.nodeAfter : $from.nodeBefore;
		if (!chip || !INLINE_CM.has(chip.type.name)) return false;
		// the caret sits on the chip's outer edge, so one step in is its first or last text position
		dispatch?.(state.tr.setSelection(TextSelection.create(state.doc, $from.pos + dir)));
		return true;
	};
}

// at a textblock edge, arrow the cursor into an adjacent code block
function cmarrowHandler(dir: 'left' | 'right' | 'up' | 'down') {
	const inline = dir === 'left' ? enterInlineCm(-1) : dir === 'right' ? enterInlineCm(1) : null;
	return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
		if (inline?.(state, dispatch)) return true;
		if (view && state.selection.empty && view.endOfTextblock(dir)) {
			const side = dir == 'left' || dir == 'up' ? -1 : 1;
			const $head = state.selection.$head;
			const nextPos = Selection.near(state.doc.resolve(side > 0 ? $head.after() : $head.before()), side);
			if (nextPos.$head && nextPos.$head.parent.type.name == 'code_block') {
				dispatch?.(state.tr.setSelection(nextPos));
				return true;
			}
		}
		return false;
	};
}

export const cmarrowHandlers = keymap({
	ArrowLeft: cmarrowHandler('left'),
	ArrowRight: cmarrowHandler('right'),
	ArrowUp: cmarrowHandler('up'),
	ArrowDown: cmarrowHandler('down')
});
