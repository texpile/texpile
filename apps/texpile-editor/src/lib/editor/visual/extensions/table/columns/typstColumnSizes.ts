import type { Transaction } from 'prosemirror-state';

/** `tr` with the Typst table at `pos` given this columns: value; its cells drop the widths the old value gave them */
export function withColumnSizes(tr: Transaction, pos: number, spec: string): Transaction {
	const table = tr.doc.nodeAt(pos);
	if (table?.type.name !== 'table') return tr;
	table.forEach((row, rowOffset) => {
		row.forEach((cell, cellOffset) => {
			if (cell.attrs.colwidth) tr.setNodeMarkup(pos + 1 + rowOffset + 1 + cellOffset, undefined, { ...cell.attrs, colwidth: null });
		});
	});
	return tr.setNodeMarkup(pos, undefined, { ...table.attrs, colspec: spec });
}
