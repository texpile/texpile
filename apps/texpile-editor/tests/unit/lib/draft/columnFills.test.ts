import { describe, expect, it } from 'vitest';
import { columnFills } from '$lib/draft/heuristics/columnFills';

// The decision under test: did the column content spills into fill its goal? Only there does
// an exact re-split reproduce the engine's spacing. It is asked PER COLUMN because the older
// page-wide inference condemned a whole page for one fil anywhere on it.
type Rec = Record<string, unknown>;
const col = (x: number, gord: number): Rec => ({ t: 'col', i: 1, x, y: 700, w: 219, h: 550, d: 0, gs: 0, gsn: 0, gord });
const end = (): Rec => ({ t: 'colend' });
// a fil in the page head, above the columns entirely: real, and no business deciding anything
const headFil: Rec = { t: 'vg', x: 0, y: 16, w: 12, nw: 0, st: 1, sto: 2, sh: 0, sho: 0 };

describe('columnFills', () => {
	it('answers per column, so a filled column beside a fil-terminated one still certifies', () => {
		const recs = [headFil, col(0, 0), end(), col(236, 2), end()];
		expect(columnFills(recs, 0)).toBe(true);
		expect(columnFills(recs, 1)).toBe(false);
	});

	it('page furniture above the columns decides nothing', () => {
		// the whole-page inference saw this fil and refused every column on the page
		expect(columnFills([headFil, col(0, 0), end()], 0)).toBe(true);
	});

	it('falls back to the page-wide inference when the column is unknown', () => {
		// no recorded columns (multicol, a float page): the older predicate answers, and a
		// page whose only stretched glue is a fil does not pack to goal
		expect(columnFills([headFil], undefined)).toBe(false);
		expect(columnFills([{ t: 'vg', x: 0, y: 100, w: 14, nw: 12, st: 3, sto: 0, sh: 0, sho: 0 }], undefined)).toBe(true);
	});
});
