import { describe, expect, it } from 'vitest';
import { cellText } from '$lib/draw/tikz/source/cd/cdEdits';
import { splitTextLines, texText, typedText } from '$lib/draw/tikz/source/sourceText';

describe('typed text', () => {
	it.each([
		'see \\ref{fig_a} now',
		'\\includegraphics[width=1cm]{plot_1.pdf}',
		'\\cite[p_1]{smith_2020}',
		'\\(x_1\\) and \\[a_b\\]',
		'$$x_1$$',
		'\\begin{tabular}{cc} a & b \\\\ c & d \\end{tabular}',
		'\\textbf{a\\_b}'
	])('leaves %s as written, typed or read back', (written) => {
		expect(texText(written)).toBe(written);
		expect(typedText(written)).toBe(written);
	});

	it('escapes plain text around a command', () => {
		expect(texText('a_b \\ref{c_d} e_f')).toBe('a\\_b \\ref{c_d} e\\_f');
		expect(typedText('50\\% \\ref{c_d}')).toBe('50% \\ref{c_d}');
	});

	it('breaks lines only outside an environment', () => {
		expect(splitTextLines('a \\\\ b')).toEqual(['a', 'b']);
		expect(splitTextLines('\\begin{tabular}{c} a \\\\ b \\end{tabular}')).toHaveLength(1);
	});

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
