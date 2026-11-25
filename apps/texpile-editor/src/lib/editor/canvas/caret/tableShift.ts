// Shift+arrows in a table: from a cell's edge the range grows by cells, as prosemirror-tables grows it, and from the
// table's last cell (its last row going down) it takes the table whole and runs on to the next text the stream gives
import { TextSelection, type Selection } from 'prosemirror-state';
import { CellSelection, TableMap, cellAround, nextCell } from 'prosemirror-tables';
import type { ResolvedPos } from 'prosemirror-model';
import type { VisualView } from '../contracts/viewTypes';
import { blockStopFrom } from './blockStops';

export type Axis = 'vertical' | 'horizontal';

/** the start of the table `$pos` is in, -1 outside one */
export function tableStart($pos: ResolvedPos): number {
	for (let depth = $pos.depth; depth > 0; depth--) if ($pos.node(depth).type.spec.tableRole === 'table') return $pos.before(depth);
	return -1;
}

function atCellEdge(view: VisualView, axis: Axis, dir: -1 | 1): boolean {
	const { $head } = view.state.selection;
	const $cell = cellAround($head);
	if (!$cell) return false;
	const cell = $cell.nodeAfter!;
	const lastBlock = $head.index($cell.depth + 1) === (dir > 0 ? cell.childCount - 1 : 0);
	if (axis === 'vertical') return lastBlock && view.endOfTextblock(dir > 0 ? 'down' : 'up');
	return lastBlock && $head.parentOffset === (dir > 0 ? $head.parent.content.size : 0);
}

/** the text edge past `edge` in `dir`, or `edge` itself when no text lies that way */
function pastTable(view: VisualView, edge: number, dir: -1 | 1): number {
	return blockStopFrom(view, edge, dir, { extend: true })?.pos ?? edge;
}

/** the range a Shift+arrow makes in the table at `table`; null when the move stays inside a cell's text */
export function shiftInTable(view: VisualView, table: number, axis: Axis, dir: -1 | 1): Selection | null {
	const { state } = view;
	const { selection, doc } = state;
	let cells: CellSelection;
	if (selection instanceof CellSelection) cells = selection;
	else if (atCellEdge(view, axis, dir)) cells = new CellSelection(cellAround(selection.$head)!);
	else return null;
	const next = nextCell(cells.$headCell, axis === 'vertical' ? 'vert' : 'horiz', dir);
	if (next) return new CellSelection(cells.$anchorCell, next);
	const tableNode = doc.nodeAt(table)!;
	const map = TableMap.get(tableNode);
	const rect = map.findCell(cells.$headCell.pos - table - 1);
	const leaves =
		axis === 'vertical' ? true : dir > 0 ? rect.right === map.width && rect.bottom === map.height : rect.left === 0 && rect.top === 0;
	// a row's end inside the table: the range stays as it is
	if (!leaves) return selection;
	const end = table + tableNode.nodeSize;
	const anchor = pastTable(view, dir > 0 ? table : end, -dir as -1 | 1);
	const head = pastTable(view, dir > 0 ? end : table, dir);
	return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
}
