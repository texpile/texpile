// the tables and grids the menus and toolbars make, as the Typst schema holds them
import type { Schema, Node as PMNode } from 'prosemirror-model';
import { generateLabel } from '$lib/editor/visual/label';

/** rows x cols table; with `header`, the first row serializes as table.header (needs a body row
 * under it). numbered wraps it in a table_wrapper (#figure), which is what typst numbers; the
 * caption starts EMPTY on purpose - typst captions are optional, so no placeholder text that
 * would publish as written (the caption slot shows a click-to-edit hint instead). */
export function typTableNode(schema: Schema, rows = 3, cols = 2, numbered = false, header = true): PMNode {
	function p() {
		return schema.nodes.paragraph.createAndFill()!;
	}
	function cell(type: 'table_header' | 'table_cell') {
		return schema.nodes[type].createAndFill(null, p())!;
	}
	function row(type: 'table_header' | 'table_cell') {
		return schema.nodes.table_row.create(
			null,
			Array.from({ length: Math.max(1, cols) }, () => cell(type))
		);
	}
	const withHeader = header && rows >= 2;
	const rowNodes = Array.from({ length: Math.max(1, rows) }, (_, r) => row(withHeader && r === 0 ? 'table_header' : 'table_cell'));
	const table = schema.nodes.table.create(null, rowNodes);
	if (!numbered) return table;
	const caption = schema.nodes.table_caption.create();
	return schema.nodes.table_wrapper.create({ label: generateLabel('table'), showNotes: false }, [table, caption]);
}

export function typGridNode(schema: Schema, count = 2): PMNode {
	const cells = Array.from({ length: count }, () => schema.nodes.typ_grid_cell.create(null, schema.nodes.paragraph.create()));
	return schema.nodes.typ_grid.create({ args: `columns: ${count}, ` }, cells);
}
