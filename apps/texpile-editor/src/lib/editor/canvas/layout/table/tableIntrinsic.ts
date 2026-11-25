// the min-content and max-content widths of a table's columns and of the table (CSS 2.1 17.5.2.2), spans included
import type { LayoutBoxBuilder, LayoutInput } from '../../contracts/layoutTypes';
import type { LayoutStyle } from '../../contracts/styleTypes';
import { lengthPx } from '../blockFlow';
import { tableBordersOf, type TableBorders } from './tableBorders';
import { measureCell } from './tableCells';
import { shareOut, type ColumnWidths } from './tableColumns';
import { readTableGrid, type GridCell, type TableGrid } from './tableGrid';

export type IntrinsicWidths = { readonly min: number; readonly max: number };

/** a table box read once per layout: its grid, its borders and its columns' widths */
export type MeasuredTable = {
	readonly grid: TableGrid;
	readonly borders: TableBorders;
	readonly columns: readonly ColumnWidths[];
	/** the border spacing between and around columns and rows; 0 when borders collapse */
	readonly spacing: { readonly horizontal: number; readonly vertical: number };
	/** border and padding of the table box around the grid */
	readonly frame: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number };
	readonly fixed: boolean;
};

const measured = new WeakMap<LayoutBoxBuilder, MeasuredTable>();

/** a length stated in px as a border-box width; percentages are left to the columns that state none */
function borderBoxPx(
	length: LayoutStyle['width'] | LayoutStyle['minWidth'] | undefined,
	layout: LayoutStyle,
	frame: number
): number | null {
	if (!length || typeof length !== 'object' || length.percent !== 0) return null;
	return layout.boxSizing === 'border-box' ? length.px : length.px + frame;
}

/** the width a box's style states, as a border box */
export function statedWidth(layout: LayoutStyle | undefined, frame: number): number | null {
	return layout ? borderBoxPx(layout.width, layout, frame) : null;
}

function horizontalFrame(layout: LayoutStyle, left: number, right: number): number {
	return left + right + lengthPx(layout.padding.left, 0) + lengthPx(layout.padding.right, 0);
}

function cellWidths(cell: GridCell, borders: TableBorders, input: Pick<LayoutInput, 'intrinsic'>): ColumnWidths {
	const used = borders.cell(cell);
	const { layout } = cell.box.style;
	const frame = horizontalFrame(layout, used.left, used.right);
	const content = measureCell(cell.box, used, input);
	const min = Math.max(content.min, borderBoxPx(layout.minWidth, layout, frame) ?? 0);
	const stated = statedWidth(layout, frame);
	return { min, max: Math.max(min, stated ?? content.max), fixed: stated === null ? null : Math.max(min, stated) };
}

/** spanning cells, narrowest span first, widen the columns they cover in proportion to the columns' max widths */
function spreadSpans(columns: ColumnWidths[], spans: readonly { cell: GridCell; widths: ColumnWidths }[], spacing: number): void {
	const ordered = [...spans].sort((a, b) => a.cell.columnSpan - b.cell.columnSpan);
	for (const { cell, widths } of ordered) {
		const covered = columns.slice(cell.column, cell.column + cell.columnSpan);
		const between = spacing * (cell.columnSpan - 1);
		const weights = covered.map((column) => column.max);
		const minExcess = widths.min - between - covered.reduce((total, column) => total + column.min, 0);
		if (minExcess > 0) shareOut(minExcess, weights).forEach((add, i) => (covered[i].min += add));
		const maxExcess = widths.max - between - covered.reduce((total, column) => total + column.max, 0);
		if (maxExcess > 0) shareOut(maxExcess, weights).forEach((add, i) => (covered[i].max += add));
		for (const column of covered) column.max = Math.max(column.max, column.min);
	}
}

export function measureTable(table: LayoutBoxBuilder, input: Pick<LayoutInput, 'intrinsic'>): MeasuredTable {
	const known = measured.get(table);
	if (known) return known;
	const grid = readTableGrid(table);
	const borders = tableBordersOf(table, grid);
	const { layout } = table.style;
	const collapsed = borders.collapsed;
	const spacing = collapsed ? { horizontal: 0, vertical: 0 } : layout.table.borderSpacing;
	const frame = {
		left: borders.table.left + (collapsed ? 0 : lengthPx(layout.padding.left, 0)),
		right: borders.table.right + (collapsed ? 0 : lengthPx(layout.padding.right, 0)),
		top: borders.table.top + (collapsed ? 0 : lengthPx(layout.padding.top, 0)),
		bottom: borders.table.bottom + (collapsed ? 0 : lengthPx(layout.padding.bottom, 0))
	};
	const columns: ColumnWidths[] = grid.columns.map((column) => {
		const fixed = statedWidth(column.box?.style.layout, 0) ?? statedWidth(column.group?.style.layout, 0);
		return { min: 0, max: fixed ?? 0, fixed };
	});
	const spans: { cell: GridCell; widths: ColumnWidths }[] = [];
	for (const cell of grid.cells) {
		const widths = cellWidths(cell, borders, input);
		if (cell.columnSpan > 1) {
			spans.push({ cell, widths });
			continue;
		}
		const column = columns[cell.column];
		column.min = Math.max(column.min, widths.min);
		column.max = Math.max(column.max, widths.max);
		if (widths.fixed !== null) column.fixed = Math.max(column.fixed ?? 0, widths.fixed);
	}
	for (const column of columns) column.max = Math.max(column.max, column.min, column.fixed ?? 0);
	spreadSpans(columns, spans, spacing.horizontal);
	const fixed = layout.table.layout === 'fixed' && layout.width !== 'auto';
	const result: MeasuredTable = { grid, borders, columns, spacing, frame, fixed };
	measured.set(table, result);
	return result;
}

/** the table box's border-box min-content and max-content widths */
export function tableIntrinsicWidths(table: LayoutBoxBuilder, input: Pick<LayoutInput, 'intrinsic'>): IntrinsicWidths {
	const { columns, spacing, frame, fixed } = measureTable(table, input);
	const around = frame.left + frame.right + spacing.horizontal * (columns.length + 1);
	if (fixed) {
		const stated = columns.reduce((total, column) => total + (column.fixed ?? 0), 0) + around;
		return { min: stated, max: stated };
	}
	const min = columns.reduce((total, column) => total + column.min, 0) + around;
	const max = columns.reduce((total, column) => total + column.max, 0) + around;
	return { min, max };
}
