// a grid container places its items in the cells of its tracks, stretched to them
import { expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../../testing/fixedStyles';
import { layoutTestBlock } from '../layoutFixture';

const RULES: FixedStyleRule[] = [
	{ selector: '.grid', look: { display: 'grid', gridTemplateColumns: '80px 1fr', columnGap: '10px', rowGap: '6px' } },
	{ selector: '.wide', look: { gridColumn: '1 / span 2' } },
	{ selector: '.tall', look: { height: '50px' } }
];

function gridBox(...cells: [string, string?][]) {
	const root = faceElement('div', 'grid');
	for (const [text, className] of cells) root.appendChild(faceElement('div', className, text));
	return layoutTestBlock(schema.nodes.paragraph.create(), { root, rules: RULES, width: 300, justify: false }).box;
}

it('puts items in tracks, rows as tall as their tallest item', () => {
	const box = gridBox(['a'], ['b', 'tall'], ['c'], ['d']);
	const [a, b, c, d] = box.children;
	expect([a.x, a.width, b.x, b.width]).toEqual([0, 80, 90, 210]);
	expect([a.y, b.y, c.y, d.y]).toEqual([0, 0, 56, 56]);
	expect(a.height).toBe(50);
	expect(c.height).toBe(24);
	expect(box.height).toBe(80);
});

it('spans a cell across the tracks by grid-column lines', () => {
	const box = gridBox(['title', 'wide'], ['x'], ['y']);
	const [title, x, y] = box.children;
	expect([title.x, title.width]).toEqual([0, 300]);
	expect([x.y, y.y]).toEqual([30, 30]);
	expect(y.x).toBe(90);
});
