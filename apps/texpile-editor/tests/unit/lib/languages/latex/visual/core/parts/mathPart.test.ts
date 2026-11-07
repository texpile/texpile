// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

describe('math in chips', () => {
	it('typesets a formula holding commands that print nothing there, a rule between rows and \\protect', () => {
		const face = latexFace(
			'\\begin{equation}\n\\begin{array}{c|c}\na & b\\\\\n\\hline c & \\protect d\n\\end{array}\n\\end{equation}',
			false
		);
		const label = face?.dom.querySelector('[role="math"]')?.getAttribute('aria-label') ?? face?.dom.getAttribute('aria-label');
		expect(label).toContain('c & ');
		expect(label).not.toMatch(/hline|protect/);
	});

	it('draws a footnote written as an environment in a display after its formula', () => {
		const face = latexFace('{$$\nc = 1.\\,\\begin{footnote}{Given $\\mu$.}\\end{footnote}\n$$}', false);
		expect(face?.dom.querySelector('.drawn-footnote')).not.toBeNull();
	});
});
