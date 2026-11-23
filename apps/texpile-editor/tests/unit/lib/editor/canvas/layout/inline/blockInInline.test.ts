import { it, expect } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../../testing/fixedStyles';
import { layoutTestBlock, lineTexts } from '../layoutFixture';

// a label drawn on a line of its own, as a % comment chip is
const LINE_CHIP: FixedStyleRule[] = [{ selector: '.label-node', look: { display: 'block', height: '40px' } }];

it('draws a line chip alone in its paragraph as one full-width line from the top, with the strut', () => {
	const layout = layoutTestBlock(schema.nodes.paragraph.create(null, schema.nodes.label.create()), { width: 300, rules: LINE_CHIP });
	const [line] = layout.box.lines!;
	expect(layout.box.lines).toHaveLength(1);
	const [chip] = line.fragments;
	expect([chip.kind, chip.width, line.y, line.height]).toEqual(['atomic', 300, 0, 40]);
});

it('ends the line before a line chip and leaves no empty line after one that ends its paragraph', () => {
	const paragraph = schema.nodes.paragraph.create(null, [schema.text('words before '), schema.nodes.label.create()]);
	expect(lineTexts(layoutTestBlock(paragraph, { width: 300, rules: LINE_CHIP }))).toEqual(['words before ', '[]']);
});

// a title block's lines inside one chip stood apart by both margins, twice the DOM's gap
it('collapses the margins of two blocks in a row inside an inline', () => {
	const root = faceElement('p');
	const parts = root.appendChild(faceElement('span'));
	parts.appendChild(faceElement('div', 'line', 'one'));
	parts.appendChild(faceElement('div', 'line', 'two'));
	const rules: FixedStyleRule[] = [{ selector: '.line', look: { display: 'block', height: '20px', margin: '6px 0' } }];
	const [one, two] = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules, justify: false }).box.lines!;
	expect(two.y - (one.y + one.height)).toBe(-6);
});
