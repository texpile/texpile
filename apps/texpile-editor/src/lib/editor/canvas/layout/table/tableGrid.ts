// a table box's grid (CSS 2.1 17.2, HTML's table model): its captions, columns, row groups, rows and the slots each cell takes
import type { LayoutBoxBuilder } from '../../contracts/layoutTypes';
import type { Display } from '../../contracts/styleTypes';

export type GridCell = {
	readonly box: LayoutBoxBuilder;
	readonly row: number;
	readonly column: number;
	readonly rowSpan: number;
	readonly columnSpan: number;
};
export type GridRow = { readonly box: LayoutBoxBuilder; readonly group: LayoutBoxBuilder | null; readonly cells: readonly GridCell[] };
export type GridColumn = { readonly box: LayoutBoxBuilder | null; readonly group: LayoutBoxBuilder | null };
export type RowGroup = { readonly box: LayoutBoxBuilder; readonly first: number; readonly count: number };

export type TableGrid = {
	readonly rows: readonly GridRow[];
	readonly columns: readonly GridColumn[];
	readonly rowGroups: readonly RowGroup[];
	readonly columnGroups: readonly LayoutBoxBuilder[];
	readonly captions: readonly LayoutBoxBuilder[];
	readonly cells: readonly GridCell[];
};

const ROW_GROUPS: ReadonlySet<Display> = new Set(['table-row-group', 'table-header-group', 'table-footer-group']);
// HTML's limits on spans
const MAX_COLUMN_SPAN = 1000;
const MAX_ROW_SPAN = 65534;

function displayOf(box: LayoutBoxBuilder): Display {
	return box.style.layout.display;
}

/** a span attribute as HTML reads it; rowspan 0 runs to the end of its row group, which the caller resolves */
function spanOf(box: LayoutBoxBuilder, name: 'colspan' | 'rowspan' | 'span', max: number): number {
	const value = parseInt(box.element?.getAttribute(name) ?? '', 10);
	if (!Number.isFinite(value) || value < 0) return 1;
	if (value === 0) return name === 'rowspan' ? 0 : 1;
	return Math.min(value, max);
}

/** row groups and rows straight under the table, header groups first and footer groups last */
function orderedGroups(table: LayoutBoxBuilder): LayoutBoxBuilder[] {
	function rank(box: LayoutBoxBuilder): number {
		return displayOf(box) === 'table-header-group' ? 0 : displayOf(box) === 'table-footer-group' ? 2 : 1;
	}
	return table.children
		.filter((child) => displayOf(child) === 'table-row' || ROW_GROUPS.has(displayOf(child)))
		.map((box, i) => ({ box, i }))
		.sort((a, b) => rank(a.box) - rank(b.box) || a.i - b.i)
		.map(({ box }) => box);
}

function columnsOf(table: LayoutBoxBuilder): { columns: GridColumn[]; groups: LayoutBoxBuilder[] } {
	const columns: GridColumn[] = [];
	const groups: LayoutBoxBuilder[] = [];
	for (const child of table.children) {
		const display = displayOf(child);
		if (display === 'table-column') {
			for (let i = spanOf(child, 'span', MAX_COLUMN_SPAN); i > 0; i--) columns.push({ box: child, group: null });
			continue;
		}
		if (display !== 'table-column-group') continue;
		groups.push(child);
		const cols = child.children.filter((col) => displayOf(col) === 'table-column');
		if (!cols.length) for (let i = spanOf(child, 'span', MAX_COLUMN_SPAN); i > 0; i--) columns.push({ box: null, group: child });
		for (const col of cols) for (let i = spanOf(col, 'span', MAX_COLUMN_SPAN); i > 0; i--) columns.push({ box: col, group: child });
	}
	return { columns, groups };
}

/** places every cell in the first free slots of its row, as HTML's table model does */
export function readTableGrid(table: LayoutBoxBuilder): TableGrid {
	const rows: GridRow[] = [];
	const rowGroups: RowGroup[] = [];
	const cells: GridCell[] = [];
	const taken: boolean[][] = [];
	for (const entry of orderedGroups(table)) {
		const loose = displayOf(entry) === 'table-row';
		const groupRows = loose ? [entry] : entry.children.filter((row) => displayOf(row) === 'table-row');
		const first = rows.length;
		const last = first + groupRows.length;
		if (!loose) rowGroups.push({ box: entry, first, count: groupRows.length });
		for (const rowBox of groupRows) {
			const r = rows.length;
			const rowCells: GridCell[] = [];
			let column = 0;
			for (const box of rowBox.children) {
				if (displayOf(box) !== 'table-cell') continue;
				while (taken[r]?.[column]) column++;
				const columnSpan = spanOf(box, 'colspan', MAX_COLUMN_SPAN);
				const asked = spanOf(box, 'rowspan', MAX_ROW_SPAN);
				const rowSpan = Math.max(1, Math.min(asked === 0 ? last - r : asked, loose ? 1 : last - r));
				for (let dr = 0; dr < rowSpan; dr++) for (let dc = 0; dc < columnSpan; dc++) (taken[r + dr] ??= [])[column + dc] = true;
				const cell = { box, row: r, column, rowSpan, columnSpan };
				rowCells.push(cell);
				cells.push(cell);
				column += columnSpan;
			}
			rows.push({ box: rowBox, group: loose ? null : entry, cells: rowCells });
		}
	}
	const declared = columnsOf(table);
	const count = Math.max(declared.columns.length, ...taken.map((row) => row?.length ?? 0), 0);
	const columns = Array.from({ length: count }, (_, i) => declared.columns[i] ?? { box: null, group: null });
	const captions = table.children.filter((child) => displayOf(child) === 'table-caption');
	return { rows, columns, rowGroups, columnGroups: declared.groups, captions, cells };
}
