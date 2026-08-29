import { describe, expect, it } from 'vitest';
import { editedLineRange } from '$lib/draft/heuristics/editedLineRange';
import { editFocus } from '$lib/draft/heuristics/editFocus';
import type { PageRecord } from '$lib/draft/geometry/geometry.types';

// The decision under test: which line the user is typing on, and therefore which page a
// straddling paragraph should scroll to. Appending at the end of a paragraph that continues
// on the next page used to scroll to its first line, a page away from the new words.
const perLine = [40, 40, 40, 40];
const ORIG = 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' ' + 'c'.repeat(40) + ' ' + 'd'.repeat(40);

describe('editedLineRange', () => {
	it('puts an append on the last line', () => {
		expect(editedLineRange(ORIG, ORIG + ' more', perLine)).toMatchObject({ to: 3 });
	});

	it('puts an edit to the opening words on the first line', () => {
		expect(editedLineRange(ORIG, 'X' + ORIG.slice(1), perLine)).toMatchObject({ from: 0, to: 0 });
	});

	it('spans the lines a multi-line replacement touched', () => {
		// replace the middle two runs: the range has to cover both, not just where it started
		const edited = ORIG.slice(0, 41) + 'X'.repeat(81) + ORIG.slice(122);
		const r = editedLineRange(ORIG, edited, perLine);
		expect(r.from).toBeLessThanOrEqual(1);
		expect(r.to).toBeGreaterThanOrEqual(2);
	});

	it('does not try to pick a line out of a single-line band', () => {
		expect(editedLineRange(ORIG, ORIG + '!', [160])).toEqual({ from: 0, to: 0 });
	});
});

const lineRecs = [0, 1, 2, 3].map((i) => ({ t: 'line', y: i * 12, h: 7, d: 2 })) as unknown as PageRecord[];
const glyphs = lineRecs.flatMap((l, i) =>
	Array.from({ length: perLine[i] }, () => ({ t: 'g', y: (l as { y: number }).y, x: 0, c: 97 }))
) as unknown as PageRecord[];
const WHOLE = { page: 1, top: 100, bottom: 200, colL: 0, colR: 300 };
const SEGS = [
	{ page: 1, top: 500, from: 0, colL: 0, colR: 220 },
	{ page: 2, top: 40, from: 2, colL: 0, colR: 220 }
];

describe('editFocus', () => {
	it('follows the edit onto the spill page when it lands past the split', () => {
		const f = editFocus(ORIG, ORIG + ' more', glyphs, lineRecs, SEGS, WHOLE, { h1: 7, dk: 2 });
		expect(f.page).toBe(2);
		// line 3 of the band, painted at the spill segment's own origin
		expect(f.top).toBeCloseTo(40 + 36 - 7, 3);
	});

	it('stays on the first page when the edit is in the opening lines', () => {
		const f = editFocus(ORIG, 'X' + ORIG.slice(1), glyphs, lineRecs, SEGS, WHOLE, { h1: 7, dk: 2 });
		expect(f.page).toBe(1);
		expect(f.top).toBeCloseTo(500 - 7, 3);
	});

	it('never reports a line outside the segment it chose', () => {
		// an edit spanning the split resolves to the segment holding its LAST line, and the
		// band it returns must not reach back across the break
		const edited = ORIG.slice(0, 41) + 'X'.repeat(81) + ORIG.slice(122);
		const f = editFocus(ORIG, edited, glyphs, lineRecs, SEGS, WHOLE, { h1: 7, dk: 2 });
		expect(f.page).toBe(2);
		expect(f.top).toBeGreaterThanOrEqual(40 + 24 - 7);
	});

	it('falls back to the whole band when there are no lines to choose between', () => {
		expect(editFocus(ORIG, ORIG + '!', [], [], SEGS, WHOLE, { h1: 7, dk: 2 })).toEqual(WHOLE);
	});
});
