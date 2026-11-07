// as in LyX, Enter at the start of the text after a display starts a new paragraph there, and Backspace joins it back
import { keymap } from 'prosemirror-keymap';
import type { Command, EditorState } from 'prosemirror-state';

/** the display right before the caret's paragraph, the caret at that paragraph's start */
function displayBeforeCaret(state: EditorState): { pos: number; continues: boolean } | null {
	const { $from, empty } = state.selection;
	if (!empty || $from.parentOffset !== 0 || $from.parent.type.name !== 'paragraph' || $from.parent.content.size === 0) return null;
	const index = $from.index(-1);
	const display = index > 0 ? $from.node(-1).child(index - 1) : null;
	if (display?.type.name !== 'block_math') return null;
	return { pos: $from.before() - display.nodeSize, continues: display.attrs.continuesAfter !== false };
}

function setContinues(continues: boolean): Command {
	return (state, dispatch) => {
		const display = displayBeforeCaret(state);
		if (!display || display.continues === continues) return false;
		dispatch?.(state.tr.setNodeAttribute(display.pos, 'continuesAfter', continues).scrollIntoView());
		return true;
	};
}

export const startParagraphAfterDisplay = setContinues(false);
export const joinParagraphToDisplay = setContinues(true);
export const displayParagraphKeys = keymap({ Enter: startParagraphAfterDisplay, Backspace: joinParagraphToDisplay });
