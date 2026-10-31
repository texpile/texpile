import { describe, expect, it } from 'vitest';
import { cellText } from '$lib/draw/tikz/source/cd/cdEdits';
import { texText, typedText } from '$lib/draw/tikz/source/sourceText';

describe('typed text', () => {
	it('writes what TeX would read as syntax as the characters, outside math', () => {
		const typed = '50% of a_b & #1 x^2, $x_1 & y^2$';
		expect(texText(typed)).toBe('50\\% of a\\_b \\& \\#1 x\\^{}2, $x_1 & y^2$');
		expect(typedText(texText(typed))).toBe(typed);
	});

	it('keeps a subscript in a diagram cell, which is math, and its ampersand in the cell', () => {
		expect(texText('a & $b_1$', true)).toBe('a \\& b_1');
	});

	it('writes an ampersand in a cell as the character where `ampersand replacement` makes \\& the next cell', () => {
		const written = cellText('Q & A', '\\&');
		expect(written).not.toContain('\\&');
		expect(typedText(written)).toBe('Q & A');
	});
});
