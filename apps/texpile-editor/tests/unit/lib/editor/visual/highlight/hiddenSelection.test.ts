import { it, expect } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import { CellSelection } from 'prosemirror-tables';
import type { Node } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { hiddenSelectionHolder } from '$lib/editor/visual/highlight/hiddenSelection';

function posOf(doc: Node, name: string, nth = 0): number {
	let at = -1;
	let seen = 0;
	doc.descendants((node, pos) => {
		if (node.type.name === name && at < 0 && seen++ === nth) at = pos;
	});
	return at;
}

// the class that hides a selection sits on the smallest node holding what the browser would paint: on the page it
// restyled the whole document
it('holds a selected node, a table for its cells, a gap cursor in its block, and nothing for text', () => {
	const cell = () => schema.nodes.table_cell.createAndFill()!;
	const table = schema.nodes.table.createAndFill(null, [
		schema.nodes.table_row.create(null, [cell(), cell()]),
		schema.nodes.table_row.create(null, [cell(), cell()])
	])!;
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, [schema.text('see'), schema.nodes.label.create({ name: 'a' })]),
		table
	]);
	const state = EditorState.create({ doc });
	const label = posOf(doc, 'label');
	expect(hiddenSelectionHolder(NodeSelection.create(doc, label))).toEqual({ from: label, to: label + 1 });
	const tableAt = posOf(doc, 'table');
	const cells = CellSelection.create(doc, posOf(doc, 'table_cell', 0), posOf(doc, 'table_cell', 3));
	expect(hiddenSelectionHolder(cells)).toEqual({ from: tableAt, to: tableAt + table.nodeSize });
	expect(hiddenSelectionHolder(TextSelection.create(doc, 2))).toBeNull();
	expect(hiddenSelectionHolder(new GapCursor(state.doc.resolve(tableAt)))).toBeNull();
	const cellAt = posOf(doc, 'table_cell', 1);
	expect(hiddenSelectionHolder(new GapCursor(doc.resolve(cellAt + 1)))).toEqual({
		from: cellAt,
		to: cellAt + doc.nodeAt(cellAt)!.nodeSize
	});
});
