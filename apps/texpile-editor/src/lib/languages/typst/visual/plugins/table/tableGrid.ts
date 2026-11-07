// the cells and lines of a table call, placed in its grid the way Typst places them: cells in order, a rowspan holding the
// rows below it, a line between the cell before it and the one after
import type { TypstEntry } from '$lib/languages/typst/knowledge';
import {
	type TypstDrawer,
	namedArg,
	positionalArgs,
	readTypstCall,
	type CallArg,
	type TypstCall,
	drawArgument,
	type ArgumentDrawing
} from '$lib/languages/typst/visual/core';
import { whole } from './tableCall';

export type PlacedCell = { drawing: ArgumentDrawing; row: number; col: number; colspan: number; rowspan: number };
export type TableLine = { at: number; call: TypstCall };
export type TableGrid = { cells: PlacedCell[]; rows: number; hlines: TableLine[]; vlines: TableLine[] };

const MOST_CELLS = 400;

/** the name of a member of the table (`hline`, `cell`) a positional argument calls, with the call */
function memberCall(arg: CallArg, table: TypstCall, entry: TypstEntry): { member: string; call: TypstCall } | null {
	if (arg.kind !== 'FuncCall') return null;
	const call = readTypstCall(`#${arg.value}`);
	const prefix = `${table.name}.`;
	const member = call?.form === 'call' && call.name.startsWith(prefix) ? call.name.slice(prefix.length) : '';
	return call && member && entry.scope && Object.hasOwn(entry.scope, member) ? { member, call } : null;
}

/** null for a table with a part this does not place: a cell past the columns, a line over some of its length */
export function placeTable(call: TypstCall, entry: TypstEntry, cols: number, drawer: TypstDrawer): TableGrid | null {
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
	function place(arg: CallArg, member: TypstCall | null): boolean {
		const spanning = member ? [namedArg(member, 'colspan'), namedArg(member, 'rowspan')] : [];
		const body = member ? (member.bodies[0] ?? positionalArgs(member).at(-1) ?? null) : arg;
		const drawing = body ? drawArgument(body, drawer) : null;
		if (!drawing) return false;
		const colspan = whole(spanning[0] ?? null) ?? 1;
		const rowspan = whole(spanning[1] ?? null) ?? 1;
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
			const made = memberCall(arg, call, entry);
			if (!made) {
				if (!place(arg, null)) return false;
				continue;
			}
			const { member, call: line } = made;
			if (member === 'cell') {
				if (!place(arg, line)) return false;
			} else if (member === 'hline' || member === 'vline') {
				if (namedArg(line, 'start') || namedArg(line, 'end')) return false;
				const vertical = member === 'vline';
				const given = whole(namedArg(line, vertical ? 'x' : 'y'));
				const next = vertical ? col : col === 0 ? row : row + 1;
				(vertical ? grid.vlines : grid.hlines).push({ at: given ?? next, call: line });
			} else if (!walk(positionalArgs(line))) return false;
		}
		return true;
	}
	// content blocks after the parentheses are cells too (`#grid(columns: 2)[a][b]`)
	return walk([...positionalArgs(call), ...call.bodies]) && grid.cells.length > 0 ? grid : null;
}
