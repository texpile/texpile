// a typst header is whole rows: a row holding a header cell, or reached by a merged one from above, is header
// all the way across, as typst lays it out. Table edits can leave a row half header (a column added beside a
// header row, a header cell merged down), and this makes the whole row one or the other
import { Plugin } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';

/** which rows of `table` typst counts as header */
export function headerRows(table: Node): Set<number> {
	const rows: Node[] = [];
	table.forEach((row) => rows.push(row));
	const header = new Set<number>();
	rows.forEach((row, i) => row.forEach((cell) => cell.type.name === 'table_header' && header.add(i)));
	// a merged header cell takes the rows it reaches into the header; a merged body cell keeps the rows it
	// reaches out of one (typst moves such a header down instead)
	for (let i = 0; i < rows.length; i++) {
		const isHeader = header.has(i);
		rows[i].forEach((cell) => {
			for (let d = 1; d < Number(cell.attrs.rowspan ?? 1) && i + d < rows.length; d++) {
				if (isHeader) header.add(i + d);
				else header.delete(i + d);
			}
		});
	}
	return header;
}

export const typstHeaderRows = new Plugin({
	appendTransaction(trs, _old, state) {
		if (!trs.some((tr) => tr.docChanged)) return null;
		const { table_header, table_cell } = state.schema.nodes;
		const tr = state.tr;
		state.doc.descendants((node, pos) => {
			if (node.type.name !== 'table') return true;
			const header = headerRows(node);
			let rowPos = pos + 1;
			let i = 0;
			node.forEach((row) => {
				const type = header.has(i) ? table_header : table_cell;
				let cellPos = rowPos + 1;
				row.forEach((cell) => {
					if (cell.type !== type) tr.setNodeMarkup(cellPos, type, cell.attrs);
					cellPos += cell.nodeSize;
				});
				rowPos += row.nodeSize;
				i++;
			});
			return false;
		});
		return tr.docChanged ? tr : null;
	}
});
