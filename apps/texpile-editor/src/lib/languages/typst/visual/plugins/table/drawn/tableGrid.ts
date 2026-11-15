import {
	type TypstDrawer,
	namedArg,
	positionalArgs,
	type CallArg,
	type TypstCall,
	drawArgument,
	type ArgumentDrawing
} from '$lib/languages/typst/visual/core';
import { whole, type TableMember, type TableRead } from './tableCall';

export type PlacedCell = { drawing: ArgumentDrawing; row: number; col: number; colspan: number; rowspan: number };
export type TableLine = { at: number; call: TypstCall };
export type TableGrid = { cells: PlacedCell[]; rows: number; hlines: TableLine[]; vlines: TableLine[] };

const MOST_CELLS = 400;

export function placeTable(read: TableRead, drawer: TypstDrawer): TableGrid | null {
	const { call, cols } = read;
	const grid: TableGrid = { cells: [], rows: 0, hlines: [], vlines: [] };
	const covered = new Set<string>();
	let row = 0;
	let col = 0;
	function advance(): void {
		for (;;) {
			while (col < cols && covered.has(`${row},${col}`)) col++;
			if (col < cols) return;
			row++;
			col = 0;
		}
	}
	function place(arg: CallArg, member: TableMember | null): boolean {
		const body = member ? (member.call.bodies[0] ?? positionalArgs(member.call).at(-1) ?? null) : arg;
		const drawing = body ? drawArgument(body, drawer) : null;
		if (!drawing) return false;
		const { colspan, rowspan } = member ?? { colspan: 1, rowspan: 1 };
		advance();
		if (col + colspan > cols) return false;
		grid.cells.push({ drawing, row, col, colspan, rowspan });
		for (let r = 0; r < rowspan; r++) for (let c = 0; c < colspan; c++) covered.add(`${row + r},${col + c}`);
		col += colspan;
		grid.rows = Math.max(grid.rows, row + rowspan);
		return true;
	}
	function walk(args: CallArg[]): boolean {
		for (const arg of args) {
			if (grid.cells.length > MOST_CELLS) return false;
			const made = read.words(arg, call);
			if (made === 'skip') continue;
			if (!made) {
				if (!place(arg, null)) return false;
				continue;
			}
			const line = made.call;
			if (made.kind === 'cell') {
				if (!place(arg, made)) return false;
			} else if (made.kind === 'hline' || made.kind === 'vline') {
				if (namedArg(line, 'start') || namedArg(line, 'end')) return false;
				const vertical = made.kind === 'vline';
				const given = whole(namedArg(line, vertical ? 'x' : 'y'));
				const next = vertical ? col : col === 0 ? row : row + 1;
				(vertical ? grid.vlines : grid.hlines).push({ at: given ?? next, call: line });
			} else if (!walk(positionalArgs(line))) return false;
		}
		return true;
	}
	if (!walk([...positionalArgs(call), ...call.bodies]) || grid.cells.length === 0) return null;
	// before the lines the table is given, whose own stroke is the one that shows
	if (read.auto?.rows) grid.hlines.unshift(...Array.from({ length: grid.rows + 1 }, (_, at) => ({ at, call })));
	if (read.auto?.columns) grid.vlines.unshift(...Array.from({ length: cols + 1 }, (_, at) => ({ at, call })));
	return grid;
}
