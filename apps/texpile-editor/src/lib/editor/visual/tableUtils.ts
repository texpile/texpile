import type { Node, Schema } from 'prosemirror-model';
import { generateLabel } from './label';

/** a table wrapper's caption and its offset in the wrapper: a Typst figure holds it after the table */
export function captionIn(wrapper: Node): { node: Node; offset: number } | null {
	let found: { node: Node; offset: number } | null = null;
	wrapper.forEach((child, offset) => {
		if (child.type.name === 'table_caption') found = { node: child, offset };
	});
	return found;
}

/** builds a table node; a numbered table is a table_wrapper with its caption */
export function createTableNode(schema: Schema, rows: number, cols: number, isNumbered = true) {
	function createEmptyParagraph(schema: Schema) {
		return schema.nodes.paragraph.createAndFill();
	}

	const rowsArray = [];
	for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
		const cells = [];
		for (let colIndex = 0; colIndex < cols; colIndex++) {
			const emptyParagraph = createEmptyParagraph(schema);
			const cell = schema.nodes.table_cell.createAndFill(null, emptyParagraph);
			if (cell) cells.push(cell);
		}
		const row = schema.nodes.table_row.create(null, cells);
		rowsArray.push(row);
	}
	const table = schema.nodes.table.create(null, rowsArray);

	if (!isNumbered) {
		return table;
	}

	// placeholder caption text so LaTeX numbers the table
	const captionText = schema.text('Table caption');
	const caption = schema.nodes.table_caption.create(null, captionText);

	const tableLabel = generateLabel('table');

	return schema.nodes.table_wrapper.create({ label: tableLabel, showNotes: false }, [caption, table]);
}
