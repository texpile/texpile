import { GapCursor } from 'prosemirror-gapcursor';
import { NodeSelection, Selection, type EditorState, type Transaction } from 'prosemirror-state';
import { gapCursorAt } from '$lib/editor/visual/gapSelection';

/** a cut block leaves the caret where the block was; the default selects the next block or enters it */
export function selectionAfterBlockCut(
	transactions: readonly Transaction[],
	oldState: EditorState,
	newState: EditorState
): Transaction | null {
	const cut = transactions.find((tr) => tr.getMeta('uiEvent') === 'cut');
	if (!cut || !cut.docChanged || !(oldState.selection instanceof NodeSelection)) return null;
	const at = Math.min(cut.mapping.map(oldState.selection.from, -1), newState.doc.content.size);
	const $at = newState.doc.resolve(at);
	const near = Selection.near($at, -1);
	// the end of the paragraph just before is the caret a paste lands after; a caret deeper in is inside another block
	const beside = near.empty && near.from === at - 1 && near.$from.depth === $at.depth + 1;
	return newState.tr.setSelection(gapCursorAt($at) ?? (beside ? near : new GapCursor($at)));
}
