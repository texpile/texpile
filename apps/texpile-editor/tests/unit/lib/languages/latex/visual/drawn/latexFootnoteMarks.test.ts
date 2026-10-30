import { describe, expect, it } from 'vitest';
import { latexFootnoteMarks } from '$lib/languages/latex/visual/extensions/drawn/latexFootnoteMarks';

describe('latexFootnoteMarks', () => {
	it('reads marks as LaTeX does: a given number is kept, a commented one is not there', () => {
		const marks = ['\\footnote{one}', '\\footnote[7]{given}', '% \\footnote{commented}', '\\footnotemark\\footnote{three}'].map(
			latexFootnoteMarks
		);
		expect(marks).toEqual([[null], [7], [], [null, null]]);
	});
});
