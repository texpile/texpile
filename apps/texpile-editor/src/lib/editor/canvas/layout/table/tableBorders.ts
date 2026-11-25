// a table's borders (CSS 2.1 17.6): separate ones as computed, or collapsed ones resolved edge by edge, half to each side
import type { DocRect, LayoutBoxBuilder } from '../../contracts/layoutTypes';
import type { BorderStyle, ComputedStyle, Display, Edges, LayoutStyle } from '../../contracts/styleTypes';
import type { GridCell, TableGrid } from './tableGrid';
import { keepCollapsedSegments } from './tableState';

type Side = keyof Edges<number>;

/** a border that stands on an edge of the grid, and whose it is */
type EdgeBorder = { readonly width: number; readonly style: BorderStyle; readonly source: ComputedStyle | null; readonly side: Side };

/** one run of a collapsed border, in the table box's border-box space; the source's color on that side paints it */
export type CollapsedBorderSegment = {
	readonly rect: DocRect;
	readonly style: BorderStyle;
	readonly width: number;
	readonly source: ComputedStyle;
	readonly side: Side;
};

export type TableBorders = {
	readonly collapsed: boolean;
	/** the table box's used border widths: half the outer collapsed borders, or its own */
	readonly table: Edges<number>;
	/** a cell's used border widths */
	cell(cell: GridCell): Edges<number>;
	/** the collapsed borders over grid lines at these x and y, in the table's border-box space */
	segments(xs: readonly number[], ys: readonly number[]): CollapsedBorderSegment[];
};

const NONE: EdgeBorder = { width: 0, style: 'none', source: null, side: 'top' };
// the style that wins between two borders of one width (17.6.2.1)
const STYLE_RANK: Readonly<Record<BorderStyle, number>> = {
	hidden: 9,
	double: 8,
	solid: 7,
	dashed: 6,
	dotted: 5,
	ridge: 4,
	outset: 3,
	groove: 2,
	inset: 1,
	none: 0
};
const GRID_PARTS: ReadonlySet<Display> = new Set([
	'table',
	'inline-table',
	'table-row-group',
	'table-header-group',
	'table-footer-group',
	'table-row',
	'table-cell',
	'table-column',
	'table-column-group'
]);

/** a part of a table whose borders collapse: the table box draws them, the part draws none of its own */
export function collapsesBorders(style: LayoutStyle): boolean {
	return style.table.borderCollapse === 'collapse' && GRID_PARTS.has(style.display);
}

export { collapsedBordersOf } from './tableState';

export function keepCollapsedBorders(table: LayoutBoxBuilder, segments: readonly CollapsedBorderSegment[]): void {
	keepCollapsedSegments(table, segments);
}

function borderOf(box: LayoutBoxBuilder | null, side: Side): EdgeBorder {
	if (!box) return NONE;
	const { layout } = box.style;
	const width = layout.borderWidth[side];
	return width > 0 ? { width, style: layout.borderStyle[side], source: box.style, side } : NONE;
}

/** hidden wins, then the wider, then the style; on a tie the earlier candidate (the cell, then above or left) */
function stronger(a: EdgeBorder, b: EdgeBorder): EdgeBorder {
	if (a.style === 'hidden' || b.style === 'none' || b.width === 0) return a;
	if (b.style === 'hidden' || a.style === 'none' || a.width === 0) return b;
	if (a.width !== b.width) return a.width > b.width ? a : b;
	return STYLE_RANK[b.style] > STYLE_RANK[a.style] ? b : a;
}

function strongest(candidates: readonly EdgeBorder[]): EdgeBorder {
	const winner = candidates.reduce(stronger, NONE);
	return winner.style === 'hidden' ? NONE : winner;
}

function separateBorders(table: LayoutBoxBuilder): TableBorders {
	const own = table.style.layout.borderWidth;
	return {
		collapsed: false,
		table: { ...own },
		cell: (cell) => ({ ...cell.box.style.layout.borderWidth }),
		segments: () => []
	};
}

/** the cell over each slot of the grid */
function slotsOf(grid: TableGrid): (GridCell | undefined)[][] {
	const slots: (GridCell | undefined)[][] = grid.rows.map(() => []);
	for (const cell of grid.cells)
		for (let r = cell.row; r < cell.row + cell.rowSpan; r++)
			for (let c = cell.column; c < cell.column + cell.columnSpan; c++) slots[r][c] = cell;
	return slots;
}

function resolveEdges(table: LayoutBoxBuilder, grid: TableGrid): { horizontal: EdgeBorder[][]; vertical: EdgeBorder[][] } {
	const rows = grid.rows.length;
	const columns = grid.columns.length;
	const slots = slotsOf(grid);
	const groupStarting = new Map(grid.rowGroups.map((group) => [group.first, group.box]));
	const groupEnding = new Map(grid.rowGroups.map((group) => [group.first + group.count, group.box]));
	function columnGroupAt(c: number): LayoutBoxBuilder | null {
		return grid.columns[c]?.group ?? null;
	}
	const horizontal: EdgeBorder[][] = [];
	for (let r = 0; r <= rows; r++) {
		const line: EdgeBorder[] = [];
		for (let c = 0; c < columns; c++) {
			const above = r > 0 ? slots[r - 1][c] : undefined;
			const below = r < rows ? slots[r][c] : undefined;
			if (above && above === below) {
				line.push(NONE);
				continue;
			}
			line.push(
				strongest([
					borderOf(above?.box ?? null, 'bottom'),
					borderOf(below?.box ?? null, 'top'),
					borderOf(r > 0 ? grid.rows[r - 1].box : null, 'bottom'),
					borderOf(r < rows ? grid.rows[r].box : null, 'top'),
					borderOf(groupEnding.get(r) ?? null, 'bottom'),
					borderOf(groupStarting.get(r) ?? null, 'top'),
					borderOf(r === 0 || r === rows ? grid.columns[c].box : null, r === 0 ? 'top' : 'bottom'),
					borderOf(r === 0 || r === rows ? columnGroupAt(c) : null, r === 0 ? 'top' : 'bottom'),
					borderOf(r === 0 || r === rows ? table : null, r === 0 ? 'top' : 'bottom')
				])
			);
		}
		horizontal.push(line);
	}
	const vertical: EdgeBorder[][] = [];
	for (let r = 0; r < rows; r++) {
		const line: EdgeBorder[] = [];
		const group = grid.rows[r].group;
		for (let c = 0; c <= columns; c++) {
			const left = c > 0 ? slots[r][c - 1] : undefined;
			const right = c < columns ? slots[r][c] : undefined;
			if (left && left === right) {
				line.push(NONE);
				continue;
			}
			const outer = c === 0 || c === columns;
			const side: Side = c === 0 ? 'left' : 'right';
			const groupLeft = c > 0 ? columnGroupAt(c - 1) : null;
			const groupRight = c < columns ? columnGroupAt(c) : null;
			line.push(
				strongest([
					borderOf(left?.box ?? null, 'right'),
					borderOf(right?.box ?? null, 'left'),
					borderOf(outer ? grid.rows[r].box : null, side),
					borderOf(outer ? group : null, side),
					borderOf(c > 0 ? grid.columns[c - 1].box : null, 'right'),
					borderOf(c < columns ? grid.columns[c].box : null, 'left'),
					borderOf(groupLeft !== groupRight ? groupLeft : null, 'right'),
					borderOf(groupLeft !== groupRight ? groupRight : null, 'left'),
					borderOf(outer ? table : null, side)
				])
			);
		}
		vertical.push(line);
	}
	return { horizontal, vertical };
}

function maxWidth(edges: readonly EdgeBorder[]): number {
	return edges.reduce((widest, edge) => Math.max(widest, edge.width), 0);
}

function drawAlike(a: EdgeBorder, b: EdgeBorder): boolean {
	return a.width === b.width && a.style === b.style && a.side === b.side && a.source?.paintId === b.source?.paintId;
}

/** the runs of one grid line where neighbouring edges draw alike; dashes start again at every cell, as Chromium draws them */
function runsOf(line: readonly EdgeBorder[]): { from: number; to: number; edge: EdgeBorder }[] {
	const runs: { from: number; to: number; edge: EdgeBorder }[] = [];
	line.forEach((edge, i) => {
		if (!edge.source || edge.style === 'none') return;
		const last = runs.at(-1);
		const continuous = edge.style !== 'dashed' && edge.style !== 'dotted';
		if (continuous && last && last.to === i && drawAlike(last.edge, edge)) last.to = i + 1;
		else runs.push({ from: i, to: i + 1, edge });
	});
	return runs;
}

function collapsedBorders(table: LayoutBoxBuilder, grid: TableGrid): TableBorders {
	const { horizontal, vertical } = resolveEdges(table, grid);
	const rows = grid.rows.length;
	const columns = grid.columns.length;
	function half(edges: readonly EdgeBorder[]): number {
		return maxWidth(edges) / 2;
	}
	const own = table.style.layout.borderWidth;
	// the inline sides look at the first row's ends, the block sides at the whole line (Chromium's NGTableBorders)
	const tableEdges = rows
		? { top: half(horizontal[0]), bottom: half(horizontal[rows]), left: vertical[0][0].width / 2, right: vertical[0][columns].width / 2 }
		: { top: own.top / 2, right: own.right / 2, bottom: own.bottom / 2, left: own.left / 2 };
	const used = new Map<GridCell, Edges<number>>();
	function corner(r: number, c: number): number {
		return Math.max(vertical[r - 1]?.[c]?.width ?? 0, vertical[r]?.[c]?.width ?? 0) / 2;
	}
	return {
		collapsed: true,
		table: tableEdges,
		cell(cell) {
			const known = used.get(cell);
			if (known) return known;
			const { row, column, rowSpan, columnSpan } = cell;
			let top = 0;
			let bottom = 0;
			let left = 0;
			let right = 0;
			for (let c = column; c < column + columnSpan; c++) {
				top = Math.max(top, horizontal[row][c].width);
				bottom = Math.max(bottom, horizontal[row + rowSpan][c].width);
			}
			for (let r = row; r < row + rowSpan; r++) {
				left = Math.max(left, vertical[r][column].width);
				right = Math.max(right, vertical[r][column + columnSpan].width);
			}
			const edges = { top: top / 2, bottom: bottom / 2, left: left / 2, right: right / 2 };
			used.set(cell, edges);
			return edges;
		},
		segments(xs, ys) {
			const segments: CollapsedBorderSegment[] = [];
			horizontal.forEach((line, r) => {
				for (const { from, to, edge } of runsOf(line)) {
					const start = xs[from] - corner(r, from);
					const end = xs[to] + corner(r, to);
					const rect = { x: start, y: ys[r] - edge.width / 2, width: end - start, height: edge.width };
					segments.push({ rect, style: edge.style, width: edge.width, source: edge.source!, side: edge.side });
				}
			});
			for (let c = 0; c <= columns; c++) {
				const line = vertical.map((row) => row[c]);
				for (const { from, to, edge } of runsOf(line)) {
					const rect = { x: xs[c] - edge.width / 2, y: ys[from], width: edge.width, height: ys[to] - ys[from] };
					segments.push({ rect, style: edge.style, width: edge.width, source: edge.source!, side: edge.side });
				}
			}
			return segments;
		}
	};
}

export function tableBordersOf(table: LayoutBoxBuilder, grid: TableGrid): TableBorders {
	return table.style.layout.table.borderCollapse === 'collapse' ? collapsedBorders(table, grid) : separateBorders(table);
}
