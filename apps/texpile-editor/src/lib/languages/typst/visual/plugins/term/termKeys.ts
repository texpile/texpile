import { keymap } from 'prosemirror-keymap';
import { Selection, type EditorState, type Plugin, type Transaction } from 'prosemirror-state';

// Enter in a term name moves into its description, as in a frame title
function enterDescription(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
	const { $from, empty } = state.selection;
	if (!empty || $from.parent.type.name !== 'term_title') return false;
	const next = Selection.findFrom(state.doc.resolve($from.after()), 1, true);
	if (next) dispatch?.(state.tr.setSelection(next).scrollIntoView());
	return true;
}

// Backspace at the start of a description stays put because the join would take the text into the name
function stayInTerm(state: EditorState): boolean {
	const { $from, empty } = state.selection;
	return empty && $from.parentOffset === 0 && $from.depth > 1 && $from.node(-1).type.name === 'term_item' && $from.index(-1) === 1;
}

export function termKeys(): Plugin[] {
	return [keymap({ Enter: enterDescription, Backspace: stayInTerm })];
}
