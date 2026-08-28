import { describe, expect, it } from 'vitest';
import { pageColumns } from '$lib/draft/geometry/pageColumns';
import { columnWindows } from '$lib/draft/heuristics/columnWindows';

// The decisions under test: a recorded column box outranks the glyph-left clustering, a
// column of another width has no engine answer, an empty column owns nothing, and adjacent
// windows may never overlap however narrow \columnsep is.
const G = 8;
type Rec = Record<string, unknown>;

// a two-column page as the walker records it: \columnwidth 229.5, \columnsep 10
const col = (x: number, w: number): Rec => ({ t: 'col', i: 1, x, y: 603, w, h: 550, d: 0 });
const twoCols: Rec[] = [col(0, 229.5), col(239.5, 229.5)];

// glyphs the clustering would elect a spurious candidate from (an indented abstract at 17)
const glyphs: Rec[] = [
	{ t: 'g', x: 0, y: 100 },
	{ t: 'g', x: 17, y: 112 },
	{ t: 'g', x: 239.5, y: 100 }
];

describe('pageColumns', () => {
	it('reads the box, in reading order, and drops an empty trailing column', () => {
		const cols = pageColumns([col(239.5, 0), ...twoCols]);
		expect(cols.map((c) => c.x)).toEqual([0, 239.5]);
		// y is the box baseline, like every other box-like record
		expect(cols[0].top).toBe(53);
		expect(cols[0].bottom).toBe(603);
	});
});

describe('columnWindows', () => {
	it('prefers the recorded columns over anything the clustering would elect', () => {
		const w = columnWindows(twoCols.concat(glyphs), glyphs, 229.5, G);
		expect(w.map((c) => c.x)).toEqual([0, 239.5]);
	});

	it('adjacent windows never overlap, however narrow the gutter', () => {
		const w = columnWindows(twoCols, [], 229.5, G);
		// \columnsep is 10 and the pad is 8, so unclamped windows would overlap by 6
		expect(w[0].colR).toBeLessThanOrEqual(w[1].colL);
		expect(w[0].colR).toBe(234.5);
		expect(w[1].colL).toBe(234.5);
		// the outer edges keep the full pad: nothing to collide with
		expect(w[0].colL).toBe(-G);
		expect(w[1].colR).toBe(239.5 + 229.5 + G);
	});

	it('keeps the full pad when the gutter is wide enough for it', () => {
		const wide = [col(0, 219), col(236, 219)];
		const w = columnWindows(wide, [], 219, G);
		expect(w[0].colR).toBe(219 + G);
		expect(w[1].colL).toBe(236 - G);
	});

	it('a width the engine recorded no column at falls back to the clustering', () => {
		// a starred float under twocolumn wraps at \textwidth, which is no column of the page
		const w = columnWindows(twoCols.concat(glyphs), glyphs, 469, G);
		expect(w.length).toBeGreaterThan(0);
		expect(w[0].colR - w[0].colL).toBe(469 + 2 * G);
	});

	it('a page with no recorded columns still clusters', () => {
		const w = columnWindows(glyphs, glyphs, 229.5, G);
		expect(w.map((c) => c.x)).toContain(0);
	});
});
