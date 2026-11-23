import { expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { NodeLocator } from '$lib/editor/canvas/layout/nodeLocator';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const { table, table_row, table_cell, paragraph } = schema.nodes;

function grid(rows: number): PMNode {
	return table.create(
		null,
		Array.from({ length: rows }, (_, r) =>
			table_row.create(
				null,
				['a', 'bb', '', 'dddd'].map((text) => table_cell.create(null, paragraph.create(null, text ? schema.text(`${text}${r}`) : null)))
			)
		)
	);
}

it('finds the node at every offset as Node.nodeAt does, in any order of asking', () => {
	const top = grid(12);
	const offsets = Array.from({ length: top.nodeSize }, (_, i) => i);
	const shuffled = [...offsets].sort((a, b) => ((a * 7919) % 31) - ((b * 7919) % 31));
	for (const order of [offsets, [...offsets].reverse(), shuffled]) {
		const locator = new NodeLocator(top);
		for (const offset of order.filter((each) => each < top.nodeSize - 1)) {
			expect(locator.at(offset)).toBe(offset === 0 ? top : top.nodeAt(offset - 1));
		}
	}
});
