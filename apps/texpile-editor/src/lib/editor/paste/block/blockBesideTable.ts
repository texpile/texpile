import { TextSelection, Selection, type EditorState, type Transaction } from 'prosemirror-state';
import type { Slice } from 'prosemirror-model';

export function pasteBesideTable(state: EditorState, slice: Slice): Transaction | null {
	const { $from } = state.selection;
	if (!(state.selection instanceof TextSelection) || slice.content.firstChild?.isInline) return null;
	let cellDepth = $from.depth;
	while (
		cellDepth > 0 &&
		$from.node(cellDepth).type.spec.tableRole !== 'cell' &&
		$from.node(cellDepth).type.spec.tableRole !== 'header_cell'
	)
		cellDepth--;
	if (cellDepth === 0 || $from.node(cellDepth).type.contentMatch.matchFragment(slice.content)) return null;
	let tableDepth = cellDepth;
	while (tableDepth > 0 && $from.node(tableDepth).type.spec.tableRole !== 'table') tableDepth--;
	while (tableDepth > 1 && $from.node(tableDepth - 1).type.name === 'table_wrapper') tableDepth--;
	const tr = state.tr.deleteSelection();
	const at = tr.mapping.map($from.after(tableDepth));
	tr.insert(at, slice.content);
	return tr.setSelection(Selection.near(tr.doc.resolve(at + slice.content.size), -1));
}
