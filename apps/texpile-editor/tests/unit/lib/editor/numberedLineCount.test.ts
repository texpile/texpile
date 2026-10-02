import { describe, it, expect } from 'vitest';
import { numberedLineCount } from '$lib/editor/visual/extensions/mathlivebridge/mathEnvironments';

describe('numberedLineCount', () => {
	it('counts a row per line, labelled or not', () => {
		expect(numberedLineCount('\\begin{align}\nf(x) &= a \\\\\n&= b.\n\\end{align}')).toBe(2);
	});

	it('does not count a trailing row separator as an empty row', () => {
		expect(numberedLineCount('\\begin{align}\na \\\\\nb \\\\\n\\end{align}')).toBe(2);
	});

	it('skips the rows that opt out of a number', () => {
		expect(numberedLineCount('\\begin{align}\na \\nonumber \\\\\nb\n\\end{align}')).toBe(1);
	});

	it('counts a cases or a matrix inside a row as part of that row', () => {
		expect(numberedLineCount('\\begin{align}\nf(x) &= \\begin{cases} 1 & x > 0 \\\\ 0 & \\text{else} \\end{cases}\n\\end{align}')).toBe(1);
		expect(numberedLineCount('\\begin{align}\nA &= \\begin{pmatrix} a \\\\ b \\end{pmatrix} \\\\\nB &= 0\n\\end{align}')).toBe(2);
	});

	it('is 1 for a single-line display', () => {
		expect(numberedLineCount('\\begin{equation}\ny = mx + b\n\\end{equation}')).toBe(1);
	});
});
