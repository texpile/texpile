// the table itself as prosemirror-tables' TableView drew it: a holder, the table with a col per column and the rows
import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasNodeViewConstructor, FaceElement } from '$lib/editor/canvas';
import { setLook } from '$lib/editor/canvas';
import type { CellAlign, TableRuleSpec } from '../rules/tableRules';
import { DEFAULT_CELL_MIN_WIDTH, GRID_HOLDER_LOOK, gridLook } from './tableLooks';
import { COLUMN_RESIZE_KEY, columnResizeKey } from './columnResize';

export type TableColumnSizes = { readonly columns: readonly (number | null)[]; readonly total: number; readonly fixed: boolean };

/** prosemirror-tables' updateColumnsOnResize: a width per column from the first row's colwidth, and the table pinned to
 * their sum when every column has one or held to it as a minimum */
export function tableColumnSizesOf(table: PMNode, defaultCellMinWidth = DEFAULT_CELL_MIN_WIDTH): TableColumnSizes {
	const columns: (number | null)[] = [];
	let total = 0;
	table.firstChild?.forEach((cell) => {
		const { colspan, colwidth } = cell.attrs as { colspan: number; colwidth: number[] | null };
		for (let j = 0; j < colspan; j++) {
			const width = colwidth?.[j] || null;
			columns.push(width);
			total += width ?? defaultCellMinWidth;
		}
	});
	return { columns, total, fixed: columns.length > 0 && columns.every((width) => width !== null) };
}

/** the widths a column drag draws until it lets go */
function withDragged(sizes: TableColumnSizes, dragged: ReadonlyMap<number, number>): TableColumnSizes {
	const columns = sizes.columns.map((width, col) => dragged.get(col) ?? width);
	const total = columns.reduce<number>((sum, width) => sum + (width ?? DEFAULT_CELL_MIN_WIDTH), 0);
	return { columns, total, fixed: columns.every((width) => width !== null) };
}

function sizesKey(table: PMNode): string {
	return JSON.stringify(tableColumnSizesOf(table).columns);
}

/** the side of a table the language's rules print as wide as its cells; null for one that fills its width */
function naturalSide(decorations: readonly Decoration[]): CellAlign | null {
	const spec = decorations.map((d) => d.spec as TableRuleSpec).find((one) => one.fillsWidth === false);
	return spec ? (spec.side ?? 'left') : null;
}

export function tableGridView(
	...[node, view, getPos, decorations]: Parameters<CanvasNodeViewConstructor>
): ReturnType<CanvasNodeViewConstructor> {
	const { el } = view.canvas.build;
	const inFloat = view.state.doc.resolve(getPos() ?? 0).parent.type.name === 'table_wrapper';
	let current = node;
	let natural = naturalSide(decorations);
	const holder = el('div', 'tableWrapper');
	setLook(holder, GRID_HOLDER_LOOK);
	const table = holder.appendChild(el('table'));
	// the pointer between cells still relays the cells' guide
	table.states = { hover: {} };
	const colgroup = table.appendChild(el('colgroup'));
	const body = table.appendChild(el('tbody'));
	const dragged = view.canvas.build.read(COLUMN_RESIZE_KEY, () => columnResizeKey.getState(view.state)?.displayWidths.get(getPos() ?? -1));
	const sizes = dragged ? withDragged(tableColumnSizesOf(node), dragged) : tableColumnSizesOf(node);
	for (const width of sizes.columns) {
		const col = colgroup.appendChild(el('col'));
		if (width) col.style.width = `${width}px`;
	}
	function dress(target: FaceElement): void {
		setLook(target, gridLook(sizes.columns.length ? sizes : null, natural, inFloat));
	}
	dress(table);
	return {
		dom: holder,
		contentDOM: body,
		// the colgroup follows the first row's spans and widths; typing in a cell keeps the elements
		update(next, nextDecorations) {
			if (!next.sameMarkup(current) || sizesKey(next) !== sizesKey(current)) return false;
			current = next;
			if (naturalSide(nextDecorations) !== natural) {
				natural = naturalSide(nextDecorations);
				for (const name of ['marginLeft', 'marginRight', 'width'] as const) table.style.removeProperty(name);
				dress(table);
			}
			return true;
		}
	};
}
