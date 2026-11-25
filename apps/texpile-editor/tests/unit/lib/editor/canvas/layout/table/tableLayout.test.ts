import { expect, it } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import type { LayoutBox } from '$lib/editor/canvas';
import { collapsedBordersOf } from '$lib/editor/canvas/layout/table/tableBorders';
import { tableColumnWidths } from '$lib/editor/canvas/layout/table/tableLayout';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { tableRules as rules } from '../../testing/tableTestRules';
import { layoutTestBlock } from '../layoutFixture';

function grid(rows: string[][], attrs: (row: number, column: number) => Record<string, unknown> = () => ({})): PMNode {
	const { table, table_row, table_cell, paragraph } = schema.nodes;
	return table.create(
		null,
		rows.map((cells, r) =>
			table_row.create(
				null,
				cells.map((text, c) => table_cell.create(attrs(r, c), paragraph.create(null, text ? schema.text(text) : null)))
			)
		)
	);
}

/** every box of a kind with its border box in the block's space */
function boxesOf(root: LayoutBox, kind: LayoutBox['kind']): { box: LayoutBox; x: number; y: number }[] {
	const found: { box: LayoutBox; x: number; y: number }[] = [];
	(function walk(box: LayoutBox, x: number, y: number) {
		if (box.kind === kind) found.push({ box, x: x + box.x, y: y + box.y });
		for (const child of box.children) walk(child, x + box.x, y + box.y);
	})(root, -root.x, -root.y);
	return found;
}

const NINE = [
	['a', 'b', 'c'],
	['d', 'e', 'f'],
	['g', 'h', 'i']
];

it('sets cells side by side at their columns, a collapsed border halved between the cells it parts', () => {
	const layout = layoutTestBlock(grid(NINE), { rules: rules() });
	const cells = boxesOf(layout.box, 'cell');
	expect(cells.map(({ x, y }) => [x, y])).toEqual([
		[0.5, 0.5],
		[100.5, 0.5],
		[200.5, 0.5],
		[0.5, 33.5],
		[100.5, 33.5],
		[200.5, 33.5],
		[0.5, 66.5],
		[100.5, 66.5],
		[200.5, 66.5]
	]);
	expect(cells.every(({ box }) => box.width === 100 && box.height === 33)).toBe(true);
	// the table shrinks to its columns and its auto margins center it
	expect([layout.box.width, layout.box.height, layout.box.x]).toEqual([301, 100, 149.5]);
	const paragraph = boxesOf(layout.box, 'block').find(({ box }) => box.element?.tagName === 'P')!;
	expect([paragraph.x, paragraph.y, paragraph.box.width]).toEqual([9, 5, 83]);
	expect(tableColumnWidths(layout.box)).toEqual([100, 100, 100]);
});

it('shares a fixed table width out equally among columns that state none', () => {
	const fixed = rules({ width: '100%', tableLayout: 'fixed' });
	const layout = layoutTestBlock(grid(NINE), { rules: fixed, width: 760 });
	expect(layout.box.width).toBe(760);
	expect(
		boxesOf(layout.box, 'cell')
			.slice(0, 3)
			.map(({ x, box }) => [x, box.width])
	).toEqual([
		[0.5, 253],
		[253.5, 253],
		[506.5, 253]
	]);
});

it('widens the columns a spanning cell covers in proportion to their max widths', () => {
	const { table, table_row, table_cell, paragraph } = schema.nodes;
	const cell = (text: string, attrs = {}) => table_cell.create(attrs, paragraph.create(null, schema.text(text)));
	const spanned = table.create(null, [
		table_row.create(null, [cell('x'.repeat(30), { colspan: 2 })]),
		table_row.create(null, [cell('d'), cell('e')])
	]);
	const layout = layoutTestBlock(spanned, { rules: rules(), width: 1000 });
	const [span, d, e] = boxesOf(layout.box, 'cell');
	// 30 characters at 9.6px with 17px of padding and borders: wider than two 100px columns, shared out evenly
	expect(span.box.width).toBeGreaterThan(300);
	expect(d.box.width + e.box.width).toBeCloseTo(span.box.width, 5);
	expect(d.box.width).toBeCloseTo(e.box.width, 5);
});

it('lets the wider rule win the edge two rows share and gives each row half of it', () => {
	const layout = layoutTestBlock(
		grid(NINE.slice(0, 2), (r) => (r === 0 ? { mcAlign: 'c' } : {})),
		{ rules: rules() }
	);
	expect(boxesOf(layout.box, 'cell').map(({ y }) => y)).toEqual([0.5, 0.5, 0.5, 34.5, 34.5, 34.5]);
	const between = collapsedBordersOf(layout.box).filter((segment) => segment.side === 'bottom' && segment.width === 3);
	expect(between.map((segment) => [segment.rect.x, segment.rect.y, segment.rect.width, segment.rect.height])).toEqual([[0, 33, 301, 3]]);
});
