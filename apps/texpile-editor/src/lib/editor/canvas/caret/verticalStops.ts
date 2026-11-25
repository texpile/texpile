// Up and Down in the caret engine: the next line of the textblock, else the stream's next stop, which a key reaches in
// reading order (a slide's second column after its first). A table is a grid: the cell above or below at the goal x, and
// past its first or last row the stream's stop beyond the table
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { TableMap } from 'prosemirror-tables';
import type { ResolvedPos } from 'prosemirror-model';
import type { CaretPlace, LineGeometry } from '../contracts/geometryTypes';
import type { VisualView } from '../contracts/viewTypes';
import { blockStopFrom, stopBeyond, type BlockStop } from './blockStops';

/** a place on a line, or a block stop */
export type VerticalStop =
	{ readonly place: CaretPlace; readonly stop?: undefined } | { readonly stop: BlockStop; readonly place?: undefined };

type CellAt = { readonly table: number; readonly cell: number };

function cellAround($pos: ResolvedPos): CellAt | null {
	for (let depth = $pos.depth; depth > 1; depth--) {
		const role = $pos.node(depth).type.spec.tableRole;
		if ((role === 'cell' || role === 'header_cell') && $pos.node(depth - 1).type.spec.tableRole === 'row')
			return { table: $pos.before(depth - 2), cell: $pos.before(depth) };
	}
	return null;
}

/** the caret at `x` on the line a text stop starts (dir 1) or ends (dir -1) */
function placeAt(view: VisualView, pos: number, x: number): CaretPlace {
	const { geometry } = view.canvas;
	const line = geometry.lineOf({ pos, affinity: 1 });
	return line ? geometry.placeOnLine(line.ref, x) : { pos, affinity: 1 };
}

/** entering a table from above or below: the cell under `x` in its first or last row */
function placeInTable(view: VisualView, pos: number, x: number): CaretPlace {
	const { geometry } = view.canvas;
	const line = geometry.lineOf({ pos, affinity: 1 });
	const hit = line && geometry.hit({ x, y: (line.top + line.bottom) / 2 });
	return hit && cellAround(view.state.doc.resolve(hit.caret.pos)) ? hit.caret : placeAt(view, pos, x);
}

function toStop(view: VisualView, stop: BlockStop | null, x: number): VerticalStop | null {
	if (!stop) return null;
	if (stop.kind !== 'text') return { stop };
	const inTable = cellAround(view.state.doc.resolve(stop.pos));
	return { place: inTable ? placeInTable(view, stop.pos, x) : placeAt(view, stop.pos, x) };
}

/** from a cell's first or last line: the cell above or below, or past the table */
function fromCell(view: VisualView, at: CellAt, dir: -1 | 1, x: number): VerticalStop | null {
	const { doc } = view.state;
	const table = doc.nodeAt(at.table)!;
	const start = at.table + 1;
	const next = TableMap.get(table).nextCell(at.cell - start, 'vert', dir);
	if (next === null) return toStop(view, blockStopFrom(view, dir > 0 ? at.table + table.nodeSize : at.table, dir), x);
	const cell = doc.nodeAt(start + next)!;
	const edge = dir > 0 ? start + next + 1 : start + next + cell.nodeSize - 1;
	const text = TextSelection.findFrom(doc.resolve(edge), dir, true);
	return text ? { place: placeAt(view, text.head, x) } : toStop(view, blockStopFrom(view, edge, dir), x);
}

function fromLine(view: VisualView, line: LineGeometry, dir: -1 | 1, x: number, extend: boolean, byCell: boolean): VerticalStop | null {
	const { geometry } = view.canvas;
	const nextRef = geometry.adjacentLine(line.ref, dir);
	if (nextRef && nextRef.textblock === line.ref.textblock) return { place: geometry.placeOnLine(nextRef, x) };
	const { selection } = view.state;
	const cell = cellAround(selection.$head);
	if (cell && byCell) return fromCell(view, cell, dir, x);
	return toStop(view, stopBeyond(view, selection, dir, { extend }), x);
}

/** Up or Down from the selection at goal `x`; null when nothing lies that way. `extend`: a range's head, which stands in
 *  text only. `byCell`: a table's grid moves the head to the cell above or below */
export function verticalStop(view: VisualView, dir: -1 | 1, x: number, extend = false, byCell = !extend): VerticalStop | null {
	const { selection } = view.state;
	const head = view.canvas.head();
	// a selected block's head stands after it, on no line of its own
	if (selection instanceof TextSelection || (selection instanceof NodeSelection && selection.node.isInline)) {
		const line = view.canvas.geometry.lineOf(head);
		if (line) return fromLine(view, line, dir, x, extend, byCell);
	}
	return toStop(view, stopBeyond(view, selection, dir, { extend }), x);
}
