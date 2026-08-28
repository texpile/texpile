import { describe, expect, it } from 'vitest';
import { seamAfter, seamForced, seamItems, seamHeight, columnIndexOf } from '$lib/draft/heuristics/seams';
import type { SeamEntry } from '$lib/draft/patch/seam.types';

// The decisions under test: the neutralized break penalty is restored from the seam's
// recorded \outputpenalty, unusable runs refuse cleanly, and column indexing trusts only
// engine-broken lines at column width.
const s = (pen: number, run: SeamEntry['run']): SeamEntry => ({ page: 1, col: 1, pen, run });
const oneCol = [{ t: 'pl', x: 57, y: 80, w: 200, h: 8, d: 3 }];
const twoCols = [...oneCol, { t: 'pl', x: 267, y: 80, w: 200, h: 8, d: 3 }];

describe('seams', () => {
	it('finds a seam by page and column', () => {
		const all = [s(0, []), { ...s(5, []), col: 2 }, { ...s(7, []), page: 2 }];
		expect(seamAfter(all, 1, 2, twoCols, 200)!.pen).toBe(5);
		expect(seamAfter(all, 2, 1, oneCol, 200)!.pen).toBe(7);
		expect(seamAfter(all, 3, 1, oneCol, 200)).toBeNull();
	});

	it('a page whose columns did not each fire serves nothing (multicol splits its own)', () => {
		// two visible columns, one recorded break: the entry is the page junction, not the
		// column junction the caller is asking about
		expect(seamAfter([s(0, [])], 1, 1, twoCols, 200)).toBeNull();
	});

	it('forced breaks are -10000 and below', () => {
		expect(seamForced(s(-10000, []))).toBe(true);
		expect(seamForced(s(-9999, []))).toBe(false);
	});

	it('restores the true break penalty the engine neutralized to 10000', () => {
		const items = seamItems(s(-300, [{ p: 10000 }, { w: 15.08, st: 4.31, sto: 0, sh: 0.86, sho: 0 }, { p: 10000 }]))!;
		expect(items[0]).toEqual({ t: 'p', p: -300 });
		// only the break node is neutralized: a later 10000 is a real \nobreak
		expect(items[2]).toEqual({ t: 'p', p: 10000 });
		expect(items[1]).toEqual({ t: 'g', w: 15.08, st: 4.31, sto: 0, sh: 0.86, sho: 0 });
	});

	it('a glue break keeps its head glue; kerns become rigid glue; junk refuses', () => {
		const items = seamItems(s(10000, [{ w: 3.12, st: 0, sto: 0, sh: 0, sho: 0 }, { k: 2 }]))!;
		expect(items).toEqual([
			{ t: 'g', w: 3.12, st: 0, sto: 0, sh: 0, sho: 0 },
			{ t: 'g', w: 2, st: 0, sto: 0, sh: 0, sho: 0 }
		]);
		expect(seamItems(s(0, [{ x: true }]))).toBeNull();
	});

	it('natural height sums glue and kerns, never penalties', () => {
		expect(seamHeight(s(0, [{ p: 10000 }, { w: 3, st: 1, sto: 0, sh: 0, sho: 0 }, { k: 2 }]))).toBe(5);
	});

	it('matches a seam to its column by firing ordinal, not by counted position', () => {
		// column 2 holds only a float, so it contributes no pl record at column width. The pl
		// scan counts one column, mismatches the two recorded firings and refuses the page's
		// seams. The column boxes carry the firing that built them, and so does each seam.
		const floatOnly = [
			...oneCol,
			{ t: 'col', i: 4, x: 57, y: 700, w: 200, h: 500, d: 0 },
			{ t: 'col', i: 7, x: 267, y: 700, w: 200, h: 500, d: 0 }
		];
		// firings skip: float and clearpage cycles fire without producing a column, so the
		// ordinals are 4 and 7 while the columns are 1 and 2. Counting cannot bridge that.
		const all = [
			{ ...s(0, []), fire: 4 },
			{ ...s(5, []), col: 2, fire: 7 }
		];
		expect(seamAfter(all, 1, 2, oneCol, 200)).toBeNull();
		expect(seamAfter(all, 1, 2, floatOnly, 200)!.pen).toBe(5);
		expect(seamAfter(all, 1, 1, floatOnly, 200)!.pen).toBe(0);
		expect(columnIndexOf(floatOnly, 200, 259)).toBe(2);
	});

	it('column index comes from engine-broken lines at column width, in reading order', () => {
		const recs = [
			{ t: 'pl', x: 57, y: 80, w: 200, h: 8, d: 3 },
			{ t: 'pl', x: 267, y: 80, w: 200, h: 8, d: 3 },
			// an indented narrow block is not a column origin
			{ t: 'pl', x: 90, y: 200, w: 140, h: 8, d: 3 }
		];
		expect(columnIndexOf(recs, 200, 49)).toBe(1);
		expect(columnIndexOf(recs, 200, 259)).toBe(2);
		expect(columnIndexOf(recs, 200, 400)).toBe(0);
	});
});
