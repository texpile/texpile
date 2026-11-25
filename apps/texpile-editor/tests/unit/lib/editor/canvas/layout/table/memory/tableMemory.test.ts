import { expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import type { FrameDecorations } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { tableRules } from '../../../testing/tableTestRules';
import { shapeOf, WarmBlock } from '../../warmBlock';

const { table, table_row, table_cell, paragraph } = schema.nodes;

function rowOf(texts: string[]): PMNode {
	return table_row.create(
		null,
		texts.map((text) => table_cell.create(null, paragraph.create(null, text ? schema.text(text) : null)))
	);
}

function rowsOf(count: number): PMNode[] {
	return Array.from({ length: count }, (_, r) => rowOf([`row ${r}`, 'alpha', 'beta', String(r * 3)]));
}

function tableOf(rows: readonly PMNode[]): PMNode {
	return table.create(null, rows);
}

function rowsIn(from: PMNode): PMNode[] {
	return Array.from({ length: from.childCount }, (_, r) => from.child(r));
}

/** the table with one cell's text replaced; every other row is the same node */
function typedIn(from: PMNode, row: number, column: number, text: string): PMNode {
	const texts = from.child(row).content.content.map((cell, c) => (c === column ? text : cell.textContent));
	return tableOf(rowsIn(from).map((each, r) => (r === row ? rowOf(texts) : each)));
}

const EDITS: [string, (doc: PMNode) => PMNode][] = [
	['a key that keeps the column widths', (doc) => typedIn(doc, 20, 1, 'alphb')],
	['a key that widens a column', (doc) => typedIn(doc, 20, 0, 'row 20 typed in this cell')],
	['a cell that wraps', (doc) => typedIn(doc, 20, 2, 'beta '.repeat(40))],
	['a row inserted at the top', (doc) => tableOf([rowOf(['new', 'row', 'at', 'top']), ...rowsIn(doc)])],
	['a row deleted', (doc) => tableOf(rowsIn(doc).filter((_, r) => r !== 5))],
	['a cell emptied', (doc) => typedIn(doc, 20, 3, '')]
];

it.each(EDITS)('lays the table out after %s as a cold layout does, with the unchanged rows kept', (_name, edit) => {
	const before = tableOf(rowsOf(60));
	const block = new WarmBlock(tableRules());
	block.lay(before);
	const after = edit(before);
	const warm = block.lay(after);
	const fresh = block.cold(after);
	expect(shapeOf(warm.layout.box)).toEqual(shapeOf(fresh.layout.box));
	expect(warm.built).toBeLessThan(fresh.built / 3);
	// and back, as an undo does: a table of the first rows again
	const undone = tableOf(rowsIn(before));
	expect(shapeOf(block.lay(undone).layout.box)).toEqual(shapeOf(block.cold(undone).layout.box));
});

it('lays a warm table out as a cold one at another width and zoom, and under a decoration in one cell', () => {
	const before = tableOf(rowsOf(30));
	const block = new WarmBlock(tableRules());
	block.lay(before, { width: 600 });
	const at = 2 + before.child(0).nodeSize * 10 + 3;
	const found: FrameDecorations = {
		inline: [{ from: at, to: at + 3, classes: ['find-match'], style: 'font-weight: bold', attrs: {}, spec: {} }],
		nodes: new Map(),
		widgets: []
	};
	const decorated = block.lay(before, { width: 600, decorations: found });
	expect(shapeOf(decorated.layout.box)).toEqual(shapeOf(block.cold(before, { width: 600, decorations: found }).layout.box));
	const narrower = block.lay(before, { width: 240 });
	expect(shapeOf(narrower.layout.box)).toEqual(shapeOf(block.cold(before, { width: 240 }).layout.box));
	expect(narrower.built).toBeLessThan(block.cold(before, { width: 240 }).built / 3);
	const zoomed = block.lay(before, { width: 240, pixelRatio: 1.5 });
	expect(shapeOf(zoomed.layout.box)).toEqual(shapeOf(block.cold(before, { width: 240, pixelRatio: 1.5 }).layout.box));
});
