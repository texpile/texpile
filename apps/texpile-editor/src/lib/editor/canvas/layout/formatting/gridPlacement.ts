// which cells each grid item takes: lines it names, spans, and auto placement in reading order
export type GridLines = { readonly start: string; readonly end: string };
export type GridCell = { readonly row: number; readonly column: number; readonly rowSpan: number; readonly columnSpan: number };

type Axis = { start: number | null; span: number };

/** one axis of an item: a line number (1 is the first line, -1 the last explicit one), a span, or auto */
function axisOf(lines: GridLines, explicit: number): Axis {
	function span(text: string): number | null {
		const match = /^span\s+(\d+)$/.exec(text.trim());
		return match ? Number(match[1]) : null;
	}
	function line(text: string): number | null {
		const value = Number(text);
		if (!Number.isInteger(value) || value === 0) return null;
		return value > 0 ? value - 1 : explicit + value + 1;
	}
	const from = line(lines.start);
	const to = line(lines.end);
	if (from !== null && to !== null) return { start: Math.min(from, to), span: Math.max(1, Math.abs(to - from)) };
	if (from !== null) return { start: from, span: span(lines.end) ?? 1 };
	if (to !== null) {
		const length = span(lines.start) ?? 1;
		return { start: Math.max(0, to - length), span: length };
	}
	return { start: null, span: span(lines.start) ?? span(lines.end) ?? 1 };
}

export type GridPlacementInput = {
	readonly items: readonly { readonly column: GridLines; readonly row: GridLines }[];
	readonly explicitColumns: number;
	readonly explicitRows: number;
	/** grid-auto-flow starts with column */
	readonly byColumn: boolean;
};

/** a cell for each item, in the order the items came: named lines first, the rest by the sparse auto-placement cursor */
export function placeGridItems(input: GridPlacementInput): GridCell[] {
	const { items, byColumn } = input;
	const crossCount = byColumn ? input.explicitRows : input.explicitColumns;
	const taken = new Set<string>();
	const placed: (GridCell | null)[] = items.map(() => null);
	function occupy(cell: GridCell): void {
		for (let r = cell.row; r < cell.row + cell.rowSpan; r++)
			for (let c = cell.column; c < cell.column + cell.columnSpan; c++) taken.add(`${r}:${c}`);
	}
	function free(cell: GridCell): boolean {
		for (let r = cell.row; r < cell.row + cell.rowSpan; r++)
			for (let c = cell.column; c < cell.column + cell.columnSpan; c++) if (taken.has(`${r}:${c}`)) return false;
		return true;
	}
	const axes = items.map((item) => ({
		column: axisOf(item.column, input.explicitColumns),
		row: axisOf(item.row, input.explicitRows)
	}));
	axes.forEach((axis, i) => {
		if (axis.column.start === null || axis.row.start === null) return;
		const cell = { row: axis.row.start, column: axis.column.start, rowSpan: axis.row.span, columnSpan: axis.column.span };
		placed[i] = cell;
		occupy(cell);
	});
	let row = 0;
	let column = 0;
	axes.forEach((axis, i) => {
		if (placed[i]) return;
		const columnSpan = axis.column.span;
		const rowSpan = axis.row.span;
		function cellAt(r: number, c: number): GridCell {
			return { row: r, column: c, rowSpan, columnSpan };
		}
		const limit = Math.max(1, crossCount);
		let cell: GridCell;
		const fixedColumn = axis.column.start;
		const fixedRow = axis.row.start;
		if (fixedColumn !== null && !byColumn) {
			if (fixedColumn < column) row++;
			column = fixedColumn;
			while (!free(cellAt(row, column))) row++;
			cell = cellAt(row, column);
			column = fixedColumn + columnSpan;
		} else if (fixedRow !== null && byColumn) {
			if (fixedRow < row) column++;
			row = fixedRow;
			while (!free(cellAt(row, column))) column++;
			cell = cellAt(row, column);
			row = fixedRow + rowSpan;
		} else {
			for (;;) {
				const cross = byColumn ? row : column;
				const span = byColumn ? rowSpan : columnSpan;
				if (cross + span > limit && cross > 0) {
					if (byColumn) {
						row = 0;
						column++;
					} else {
						column = 0;
						row++;
					}
					continue;
				}
				const candidate = cellAt(row, column);
				if (free(candidate)) {
					cell = candidate;
					break;
				}
				if (byColumn) row++;
				else column++;
			}
			if (byColumn) row += rowSpan;
			else column += columnSpan;
		}
		placed[i] = cell;
		occupy(cell);
	});
	return placed as GridCell[];
}
