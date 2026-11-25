import { it, expect } from 'vitest';
import { faceElement, type LayoutBox } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../../testing/fixedStyles';
import { layoutTestBlock } from '../layoutFixture';

const RULES: FixedStyleRule[] = [
	{ selector: '.quote', look: { margin: '16px 32px' } },
	{ selector: 'p', look: { margin: '0px 0px 12px' } },
	{ selector: 'h2', look: { margin: '20px 0px 8px' } },
	{ selector: '.spacer', look: { margin: '30px 0px 5px' } },
	{ selector: '.padded', look: { padding: '4px 0px 0px' } },
	{ selector: '.narrow', look: { width: '200px', margin: '0px auto' } }
];

function quote(...classes: string[]): ReturnType<typeof faceElement> {
	const root = faceElement('div', ['quote', ...classes].join(' '));
	root.append(
		faceElement('p', undefined, 'one'),
		faceElement('h2', undefined, 'two'),
		faceElement('div', 'spacer'),
		faceElement('p', undefined, 'three')
	);
	return root;
}

function tops(box: LayoutBox): number[] {
	return box.children.map((child) => child.y);
}

it('collapses sibling margins to the larger, through an empty block and through a parent with no padding', () => {
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root: quote(), rules: RULES });
	// p, then h2 20 below (not 12 + 20), the empty spacer's 30 standing for the gap to the last p
	expect(tops(layout.box)).toEqual([0, 44, 68, 98]);
	expect(layout.box.x).toBe(32);
	expect(layout.box.width).toBe(536);
	expect(layout.height).toBe(122);
	expect(layout.outerMargin).toEqual({ top: 16, bottom: 16 });
});

it('keeps the first child margin inside a parent with top padding', () => {
	const root = quote('padded');
	(root.firstElementChild as ReturnType<typeof faceElement>).classList.add('spacer');
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules: RULES });
	expect(layout.box.children[0].y).toBe(4 + 30);
	expect(layout.outerMargin.top).toBe(16);
});

it('centers a block of a fixed width between auto margins', () => {
	const root = faceElement('div');
	root.append(faceElement('div', 'narrow', 'centered'));
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules: RULES, width: 600 });
	expect(layout.box.children[0].x).toBe(200);
	expect(layout.box.children[0].width).toBe(200);
});
