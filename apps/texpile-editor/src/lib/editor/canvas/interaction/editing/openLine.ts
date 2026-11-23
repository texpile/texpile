// macOS Ctrl+O: a paragraph break after the caret, which stays where it was
import { canSplit } from 'prosemirror-transform';
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state';

export function openLineTr(state: EditorState): Transaction | null {
	const { selection } = state;
	if (!(selection instanceof TextSelection) || !selection.empty || !canSplit(state.doc, selection.head)) return null;
	const tr = state.tr.split(selection.head);
	return tr.setSelection(TextSelection.create(tr.doc, selection.head));
}
