// a vertical-rl inline box is turned a quarter: as wide as its line is tall, as tall as its line is long
import { expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { aboutPoint, orientMatrix, transformMatrixOf } from '$lib/editor/canvas/layout/transforms';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { FixedStyleRule } from '../testing/fixedStyles';
import { fixedStyles } from '../testing/fixedStyles';
import { layoutTestBlock } from './layoutFixture';

const RULES: FixedStyleRule[] = [{ selector: '.turned', look: { display: 'inline-block', writingMode: 'vertical-rl' } }];

it('swaps the width and height of a vertical-rl atomic inline and keeps its text on one line', () => {
	const root = faceElement('p');
	const turned = faceElement('span', 'turned', 'abcde');
	root.appendChild(turned);
	const layout = layoutTestBlock(schema.nodes.paragraph.create(), { root, rules: RULES, width: 300, justify: false });
	const box = layout.box.lines![0].fragments.find((fragment) => fragment.kind === 'atomic')!;
	const inner = box.kind === 'atomic' ? box.box : null;
	expect(inner!.width).toBe(24);
	expect(inner!.height).toBeCloseTo(48, 0);
	expect(inner!.lines).toHaveLength(1);
});

it('turns the content a quarter clockwise into the swapped box', () => {
	const [a, b, c, d, e, f] = orientMatrix({ width: 24 });
	const point = (x: number, y: number) => [a * x + c * y + e, b * x + d * y + f];
	expect(point(0, 0)).toEqual([24, 0]);
	expect(point(48, 24)).toEqual([0, 48]);
});

it('turns a box a half about its middle for rotate(180deg)', () => {
	const el = faceElement('span');
	const style = fixedStyles([{ selector: 'span', look: { transform: 'rotate(180deg)' } }]).styleOf(el)!;
	const matrix = transformMatrixOf(style, { width: 40, height: 20 })!;
	const [a, b, c, d, e, f] = aboutPoint(matrix, 100, 50);
	expect([a, d].map(Math.round)).toEqual([-1, -1]);
	expect(Math.abs(b) + Math.abs(c)).toBeLessThan(1e-9);
	expect([Math.round(e), Math.round(f)]).toEqual([240, 120]);
});
