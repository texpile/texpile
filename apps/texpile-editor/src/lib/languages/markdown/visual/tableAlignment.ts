// a pipe table's alignments are its delimiter row, one per column, kept on the table as its colspec: they
// follow their columns when one is put in or taken out, as the cells do
import { Plugin } from 'prosemirror-state';
import { Mapping } from 'prosemirror-transform';
import { TableMap } from 'prosemirror-tables';
import type { Node as PMNode } from 'prosemirror-model';

function isTable(node: PMNode | null | undefined): node is PMNode {
	return node?.type.spec.tableRole === 'table';
}

/** where each old column's cells went in the new table, read through the mapping */
function movedSpec(oldTable: PMNode, oldStart: number, newTable: PMNode, newStart: number, mapping: Mapping): string[] {
	const spec = String(oldTable.attrs.colspec).split('|');
	const before = TableMap.get(oldTable);
	const after = TableMap.get(newTable);
	const out = Array<string>(after.width).fill('---');
	for (let col = 0; col < before.width; col++) {
		for (let row = 0; row < before.height; row++) {
			const moved = mapping.mapResult(oldStart + before.map[row * before.width + col], 1);
			if (moved.deleted) continue;
			const at = after.map.indexOf(moved.pos - newStart);
			if (at >= 0) out[at % after.width] = spec[col] || '---';
			break;
		}
	}
	return out;
}

export const tableAlignment = new Plugin({
	appendTransaction(trs, oldState, state) {
		if (!trs.some((t) => t.docChanged)) return null;
		const mapping = new Mapping();
		for (const t of trs) mapping.appendMapping(t.mapping);
		const tr = state.tr;
		oldState.doc.descendants((oldTable, pos) => {
			if (!isTable(oldTable)) return true;
			if (!oldTable.attrs.colspec) return false;
			const moved = mapping.mapResult(pos, 1);
			const newTable = state.doc.nodeAt(moved.pos);
			if (moved.deleted || !isTable(newTable) || TableMap.get(newTable).width === TableMap.get(oldTable).width) return false;
			const colspec = movedSpec(oldTable, pos + 1, newTable, moved.pos + 1, mapping).join('|');
			if (colspec !== newTable.attrs.colspec) tr.setNodeMarkup(moved.pos, undefined, { ...newTable.attrs, colspec });
			return false;
		});
		return tr.docChanged ? tr : null;
	}
});
