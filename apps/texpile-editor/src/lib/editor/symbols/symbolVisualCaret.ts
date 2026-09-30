import { NodeSelection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';

/** a selected node (a formula, an image, a chip) stays: a symbol goes in right after it */
export function collapseNodeSelection(state: EditorState): Transaction {
	const { selection } = state;
	if (!(selection instanceof NodeSelection)) return state.tr;
	return state.tr.setSelection(TextSelection.near(state.doc.resolve(selection.to)));
}
