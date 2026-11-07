import { describe, expect, it } from 'vitest';
import { chipCounts } from '$lib/languages/latex/visual/core/plugin/chipCounts';

function chipFootnotes(source: string): (number | null)[] {
	return chipCounts(source).footnote ?? [];
}

describe('chipFootnotes', () => {
	it('reads marks as LaTeX does: a given number is kept, a commented one is not there', () => {
		const marks = ['\\footnote{one}', '\\footnote[7]{given}', '% \\footnote{commented}', '\\footnotemark\\footnote{three}'].map(
			chipFootnotes
		);
		expect(marks).toEqual([[null], [7], [], [null, null]]);
	});

	it('counts a footnote citation in the same counter, and not one that names only its note', () => {
		expect(chipFootnotes('\\footcite{a}\\footnote{b}\\footcitetext{c}')).toEqual([null, null]);
	});
});
