// Enter in a cell goes to the cell below, and in the last row adds a row to go on in; in a table's caption it goes to the first cell
import { Selection, TextSelection, type EditorState, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { TableMap } from 'prosemirror-tables';
import { addTableRow } from './addTableRow';

function moveTo(state: EditorState, dispatch: ((tr: Transaction) => void) | undefined, pos: number, dir: -1 | 1): boolean {
	const target = Selection.findFrom(state.doc.resolve(pos), dir, true);
	if (target) dispatch?.(state.tr.setSelection(target).scrollIntoView());
	return true;
}

export function enterInTable(state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView): boolean {
	const { selection } = state;
	if (!(selection instanceof TextSelection)) return false;
	const { $from } = selection;
	if (!$from.sameParent(selection.$to)) return false;
	if ($from.parent.type.name === 'table_caption') return moveTo(state, dispatch, $from.after(), 1);
	const cellDepth = $from.depth - 1;
	const role = $from.node(cellDepth).type.spec.tableRole;
	if (cellDepth < 3 || (role !== 'cell' && role !== 'header_cell')) return false;
	const table = $from.node(cellDepth - 2);
	const tableStart = $from.start(cellDepth - 2);
	const map = TableMap.get(table);
	const rect = map.findCell($from.before(cellDepth) - tableStart);
	if (rect.bottom < map.height) {
		const below = tableStart + map.map[rect.bottom * map.width + rect.left];
		return moveTo(state, dispatch, below + table.nodeAt(below - tableStart)!.nodeSize - 1, -1);
	}
	if (dispatch && view && addTableRow(view, 1)) enterInTable(view.state, view.dispatch, view);
	return true;
}
