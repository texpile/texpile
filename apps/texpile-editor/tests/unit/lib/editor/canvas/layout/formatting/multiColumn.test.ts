// column-count with balanced fill: a paragraph's lines are cut in two columns, two lines staying on each side of the cut
import { describe, expect, it } from 'vitest';
import { faceElement } from '$lib/editor/canvas';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { balancedHeight } from '$lib/editor/canvas/layout/formatting/multiColumn';
import type { ColumnPiece } from '$lib/editor/canvas/layout/formatting/columnPieces';
import type { FixedStyleRule } from '../../testing/fixedStyles';
import { layoutTestBlock } from '../layoutFixture';

const RULES: FixedStyleRule[] = [{ selector: '.cols', look: { columnCount: '2', columnGap: '20px' } }];
const WORDS = Array.from({ length: 24 }, (_, i) => `word${String(i).padStart(2, '0')}`).join(' ');

function columnsOf(text: string, rules = RULES) {
	const root = faceElement('div', 'cols');
	root.appendChild(faceElement('p', undefined, text));
	return layoutTestBlock(schema.nodes.paragraph.create(), { root, rules, width: 220, justify: false }).box;
}

const piece = (height: number, gapBefore = 0): ColumnPiece => ({ child: 0, lines: null, start: 0, height, gapBefore });

describe('balancing', () => {
	it('finds the smallest column height that fits the pieces in the columns', () => {
		expect(balancedHeight([piece(10), piece(10), piece(10), piece(10)], 2)).toBe(20);
		expect(balancedHeight([piece(30), piece(10), piece(10)], 2)).toBe(30);
	});
});

describe('a paragraph in two columns', () => {
	it('puts the lines in two columns of equal height, the second beginning at the top', () => {
		const box = columnsOf(WORDS);
		const [paragraph] = box.children;
		const lines = paragraph.lines!;
		const left = lines.filter((line) => line.fragments[0].x < 100);
		const right = lines.filter((line) => line.fragments[0].x >= 100);
		expect(left.length + right.length).toBe(lines.length);
		expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1);
		expect(right[0].y).toBe(0);
		expect(right[0].fragments[0].x).toBe(120);
		expect(box.height).toBe(Math.ceil(lines.length / 2) * 24);
	});

	it('lists the second column as a continuation of the paragraph box', () => {
		const [paragraph] = columnsOf(WORDS).children;
		expect(paragraph.width).toBe(100);
		expect(paragraph.continuations).toEqual([{ x: 120, y: 0, width: 100, height: expect.any(Number) }]);
	});

	it('keeps a paragraph of three lines (too few to cut) whole in the first column', () => {
		const box = columnsOf('word00 word01 word02');
		expect(box.children[0].continuations).toBeUndefined();
	});
});
