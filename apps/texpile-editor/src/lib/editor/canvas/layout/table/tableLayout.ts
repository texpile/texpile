// CSS table layout (15.1): auto and fixed column widths, row heights, spans, vertical alignment and collapsed borders
import type { LayoutBoxBuilder, LayoutInput } from '../../contracts/layoutTypes';
import type { VerticalAlign } from '../../contracts/styleTypes';
import { keepCollapsedBorders } from './tableBorders';
import { layoutCell, shiftCellContent, stretchCellAbsolutes } from './tableCells';
import { autoColumnWidths, fixedColumnWidths, shareOut } from './tableColumns';
import type { GridCell, TableGrid } from './tableGrid';
import { measureTable, statedWidth, type MeasuredTable } from './tableIntrinsic';
import { keepColumnWidths } from './tableState';

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

/** fixed layout reads the widths its columns and its first row state (17.5.2.1) */
function fixedStated(grid: TableGrid): (number | null)[] {
	const stated: (number | null)[] = grid.columns.map(
		(column) => statedWidth(column.box?.style.layout, 0) ?? statedWidth(column.group?.style.layout, 0)
	);
	for (const cell of grid.rows[0]?.cells ?? []) {
		const { layout } = cell.box.style;
		const width = statedWidth(layout, 0);
		if (width === null) continue;
		for (let c = cell.column; c < cell.column + cell.columnSpan; c++) stated[c] ??= width / cell.columnSpan;
	}
	return stated;
}

function columnWidthsFor(draft: LayoutBoxBuilder, table: MeasuredTable, around: number): number[] {
	const grid = Math.max(0, draft.width - around);
	return table.fixed ? fixedColumnWidths(fixedStated(table.grid), grid) : autoColumnWidths(table.columns, grid);
}

/** the row heights the cells need, with rowspans spread over the rows they cover (17.5.3) */
function rowHeightsFor(table: MeasuredTable, baselines: number[]): number[] {
	const { grid, spacing } = table;
	const heights = grid.rows.map((row) => {
		const { height } = row.box.style.layout;
		return height !== 'auto' && height.percent === 0 ? height.px : 0;
	});
	for (const cell of grid.cells) {
		if (cell.rowSpan > 1) continue;
		const shift = alignsOnBaseline(cell) ? baselines[cell.row] - cellBaseline(cell) : 0;
		heights[cell.row] = Math.max(heights[cell.row], shift + cell.box.height);
	}
	for (const cell of grid.cells.filter((each) => each.rowSpan > 1).sort((a, b) => a.rowSpan - b.rowSpan)) {
		const covered = heights.slice(cell.row, cell.row + cell.rowSpan);
		const excess = cell.box.height - sum(covered) - spacing.vertical * (cell.rowSpan - 1);
		if (excess > 0) shareOut(excess, covered).forEach((add, i) => (heights[cell.row + i] += add));
	}
	return heights;
}

function alignsOnBaseline(cell: GridCell): boolean {
	const align = cell.box.style.layout.verticalAlign;
	return cell.rowSpan === 1 && align !== 'top' && align !== 'middle' && align !== 'bottom';
}

function cellBaseline(cell: GridCell): number {
	return cell.box.baselines?.first ?? cell.box.height;
}

function contentOffset(align: VerticalAlign, room: number, baselineShift: number): number {
	if (align === 'top') return 0;
	if (align === 'middle') return room / 2;
	if (align === 'bottom') return room;
	return baselineShift;
}

/** places the rows, their groups, the cells and the columns, and returns the y of every grid line */
function placeGrid(
	table: MeasuredTable,
	xs: readonly number[],
	top: number,
	heights: readonly number[],
	baselines: readonly number[]
): number[] {
	const { grid, spacing } = table;
	const ys = [top + spacing.vertical];
	heights.forEach((height, r) => ys.push(ys[r] + height + spacing.vertical));
	function spanBottom(first: number, count: number): number {
		return count ? ys[first + count] - spacing.vertical : ys[first];
	}
	const left = xs[0] - spacing.horizontal;
	const right = xs.at(-1)!;
	const groupTop = new Map<LayoutBoxBuilder, number>();
	for (const group of grid.rowGroups) {
		Object.assign(group.box, {
			x: left,
			y: ys[group.first],
			width: right - left,
			height: spanBottom(group.first, group.count) - ys[group.first]
		});
		groupTop.set(group.box, ys[group.first]);
	}
	grid.rows.forEach((row, r) => {
		const parentTop = row.group ? groupTop.get(row.group)! : 0;
		Object.assign(row.box, { x: row.group ? 0 : left, y: ys[r] - parentTop, width: right - left, height: heights[r] });
		for (const cell of row.cells) {
			const height = spanBottom(cell.row, cell.rowSpan) - ys[cell.row];
			const shift = alignsOnBaseline(cell) ? baselines[r] - cellBaseline(cell) : 0;
			shiftCellContent(cell.box, contentOffset(cell.box.style.layout.verticalAlign, height - cell.box.height, shift));
			stretchCellAbsolutes(cell.box, height - cell.box.height);
			Object.assign(cell.box, { x: xs[cell.column] - left, y: 0, height });
		}
	});
	const gridHeight = spanBottom(0, heights.length) - ys[0];
	for (const box of grid.columnGroups) {
		const first = grid.columns.findIndex((column) => column.group === box);
		const count = grid.columns.filter((column) => column.group === box).length;
		const x = first < 0 ? xs[0] : xs[first];
		Object.assign(box, { x, y: ys[0], width: first < 0 ? 0 : xs[first + count] - spacing.horizontal - x, height: gridHeight });
		for (const col of box.children) {
			const at = grid.columns.findIndex((column) => column.box === col);
			const width = at < 0 ? 0 : xs[at + 1] - spacing.horizontal - xs[at];
			Object.assign(col, { x: at < 0 ? 0 : xs[at] - x, y: 0, width, height: gridHeight });
		}
	}
	return ys;
}

/** the table formatting context: the table box's width is its border box, which the columns may widen */
export function layoutTable(draft: LayoutBoxBuilder, _children: readonly LayoutBoxBuilder[], input: LayoutInput): void {
	const table = measureTable(draft, input);
	const { grid, borders, spacing, frame } = table;
	const around = frame.left + frame.right + spacing.horizontal * (grid.columns.length + 1);
	const widths = columnWidthsFor(draft, table, around);
	draft.width = Math.max(draft.width, sum(widths) + around);
	const xs = [frame.left + spacing.horizontal];
	widths.forEach((width, c) => xs.push(xs[c] + width + spacing.horizontal));
	for (const cell of grid.cells) {
		const width = xs[cell.column + cell.columnSpan] - spacing.horizontal - xs[cell.column];
		layoutCell(cell.box, width, borders.cell(cell), input);
	}
	let y = 0;
	const captions = grid.captions.map((caption) => {
		input.layout(caption, draft.width);
		return caption;
	});
	for (const caption of captions.filter((each) => each.style.layout.table.captionSide === 'top')) {
		Object.assign(caption, { x: 0, y });
		y += caption.height;
	}
	const baselines = grid.rows.map(() => 0);
	for (const cell of grid.cells) if (alignsOnBaseline(cell)) baselines[cell.row] = Math.max(baselines[cell.row], cellBaseline(cell));
	const heights = rowHeightsFor(table, baselines);
	const { height } = draft.style.layout;
	const stated = height !== 'auto' && height.percent === 0 ? height.px : 0;
	const natural = sum(heights) + spacing.vertical * (heights.length + 1) + frame.top + frame.bottom;
	if (stated > natural && heights.length) shareOut(stated - natural, heights).forEach((add, r) => (heights[r] += add));
	const ys = placeGrid(table, xs, y + frame.top, heights, baselines);
	y = ys.at(-1)! + frame.bottom;
	for (const caption of captions.filter((each) => each.style.layout.table.captionSide === 'bottom')) {
		Object.assign(caption, { x: 0, y });
		y += caption.height;
	}
	draft.height = y;
	const lead = grid.rows[0]?.cells.find((cell) => cell.box.baselines);
	draft.baselines = lead ? { first: ys[0] + lead.box.baselines!.first, last: ys[0] + lead.box.baselines!.first } : null;
	keepCollapsedBorders(draft, borders.collapsed ? borders.segments(xs, ys) : []);
	keepColumnWidths(draft, widths);
}

export { tableColumnWidths } from './tableState';
