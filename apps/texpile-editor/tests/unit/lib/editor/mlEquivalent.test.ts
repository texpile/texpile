import { describe, it, expect } from 'vitest';
import { mathLatexEquivalent, withoutEmptySlots } from '$lib/editor/visual/extensions/mathlivebridge/mlEquivalent';

describe('withoutEmptySlots', () => {
	it('leaves a slot of a fraction or a matrix empty instead of writing \\placeholder', () => {
		expect(withoutEmptySlots('\\frac{\\placeholder{}}{2}')).toBe('\\frac{}{2}');
		expect(withoutEmptySlots('\\begin{pmatrix}1 & \\placeholder{}\\\\ \\placeholder{} & 4\\end{pmatrix}')).toBe(
			'\\begin{pmatrix}1 & \\\\  & 4\\end{pmatrix}'
		);
	});

	it('keeps a control word apart from a letter after the slot', () => {
		expect(withoutEmptySlots('\\cdot\\placeholder{}x')).toBe('\\cdot x');
		expect(withoutEmptySlots('\\cdot\\placeholder{}\\placeholder{}x')).toBe('\\cdot x');
		expect(withoutEmptySlots('\\cdot\\placeholder{}2')).toBe('\\cdot2');
	});
});

describe('mathLatexEquivalent', () => {
	it('ignores the space that only terminates a control word', () => {
		expect(mathLatexEquivalent('\\prob{y \\mid \\vecx}', '\\prob{y \\mid\\vecx}')).toBe(true);
	});

	it('still sees a real edit', () => {
		expect(mathLatexEquivalent('\\alpha + \\beta', '\\alpha + \\gamma')).toBe(false);
		expect(mathLatexEquivalent('x^2', 'x^3')).toBe(false);
	});

	it('keeps an interword space, which is a control symbol and not a gap', () => {
		expect(mathLatexEquivalent('a\\ b', 'ab')).toBe(false);
	});
});
