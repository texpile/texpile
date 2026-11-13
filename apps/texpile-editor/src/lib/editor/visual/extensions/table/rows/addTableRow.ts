// a row added beside the caret's keeps the table in the lines it has, and Tab in the last cell adds one to go on in
import type { EditorState, Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { addRowAfter, addRowBefore, goToNextCell, isInTable } from 'prosemirror-tables';
import { tableLookOf } from '../rules/tableRules';

export function addTableRow(view: EditorView, side: -1 | 1): boolean {
	const { $head } = view.state.selection;
	let depth = $head.depth;
	while (depth > 0 && $head.node(depth).type.spec.tableRole !== 'table') depth--;
	const look = depth ? tableLookOf(view.state) : null;
	const lines = look?.linesOf($head.node(depth)) ?? null;
	const pos = depth ? $head.before(depth) : -1;
	if (!(side < 0 ? addRowBefore : addRowAfter)(view.state, view.dispatch)) return false;
	// the new row has no rule of its own: a table with every line would miss the one over it
	if (look && lines) look.setLines(view, pos, lines);
	return true;
}

export function tabThroughCells(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean {
	if (goToNextCell(1)(state, dispatch)) return true;
	if (!isInTable(state)) return false;
	if (dispatch && view && addTableRow(view, 1)) goToNextCell(1)(view.state, view.dispatch);
	return true;
}
