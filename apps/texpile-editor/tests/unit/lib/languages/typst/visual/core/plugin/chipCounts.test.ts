import { describe, expect, it } from 'vitest';
import { typstChipCounts } from '$lib/languages/typst/visual/core/plugin/chipCounts';

const footnotes = (source: string) => typstChipCounts(source).footnote ?? [];

describe('typstChipCounts', () => {
	it('counts every footnote with a note of its own, nested ones too', () => {
		expect(footnotes('#footnote[a]')).toEqual([null]);
		expect(footnotes('#text(red)[x#footnote[a] y#footnote[b]]')).toHaveLength(2);
		expect(footnotes('#footnote(<fn>)')).toHaveLength(0);
		expect(footnotes('// #footnote[commented]')).toHaveLength(0);
	});

	it('counts a footnote whose note is an argument, as one with a body', () => {
		expect(footnotes('#footnote("A note")')).toHaveLength(1);
		expect(footnotes('#footnote([A note]) and #footnote[Another]')).toHaveLength(2);
	});
});
