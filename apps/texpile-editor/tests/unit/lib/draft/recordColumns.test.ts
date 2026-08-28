import { describe, expect, it } from 'vitest';
import { hasRecordedColumns, recordColumns } from '$lib/draft/geometry/recordColumns';
import { splitPatchRecords } from '$lib/draft/draftPaint';
import type { Patch } from '$lib/draft/patch/patch.types';

// The decision under test: a record's column is where it sits in the stream, not where its x
// falls. The two differ exactly where it matters, on material that is in NO column but whose
// x lies inside one.
type Rec = Record<string, unknown>;
const col = (x: number, w = 219): Rec => ({ t: 'col', i: 1, x, y: 700, w, h: 500, d: 0 });
const end = (): Rec => ({ t: 'colend' });
const g = (x: number, y: number): Rec => ({ t: 'g', x, y });

describe('recordColumns', () => {
	it('assigns by run, and gives furniture no column at all', () => {
		const recs = [col(0), g(10, 100), end(), col(236), g(240, 100), end(), g(120, 780)];
		expect(recordColumns(recs)).toEqual([-1, 0, -1, -1, 1, -1, -1]);
		expect(hasRecordedColumns(recs)).toBe(true);
		expect(hasRecordedColumns([g(1, 1)])).toBe(false);
	});

	it('an empty trailing column owns nothing and does not consume an index', () => {
		const recs = [col(0), g(10, 100), end(), col(236, 0), end(), col(400), g(410, 100), end()];
		// the zero-width box is skipped, so the third column is still index 1
		expect(recordColumns(recs)).toEqual([-1, 0, -1, -1, -1, -1, 1, -1]);
	});
});

describe('splitPatchRecords by recorded column', () => {
	const patch = (over: Partial<Patch>): Patch =>
		({ top: 0, dropTop: 90, dropBottom: 110, delta: 10, paraLeft: 0, colL: -8, colR: 227, newRecs: [], ...over }) as Patch;

	it('leaves a full-width float alone even though its x sits inside the patched column', () => {
		// a figure* spans the text block, so its glyphs lie inside column one's x-range. The
		// x-window shifted them with the column; the run says they are in no column.
		const recs = [col(0), g(10, 100), g(10, 200), end(), col(236), g(240, 200), end(), g(30, 300)];
		const { unchanged, shifted } = splitPatchRecords(recs, [patch({ col: 0 })], 1000);
		// the below-band glyph of column 0 shifts; the full-width one at y 300 does not
		expect(shifted[0]).toHaveLength(1);
		expect(shifted[0][0]).toMatchObject({ x: 10, y: 200 });
		expect(unchanged).toContainEqual(expect.objectContaining({ x: 30, y: 300 }));
	});

	it('falls back to the x-window when the page recorded no columns', () => {
		const recs = [g(10, 100), g(10, 200)];
		const { shifted } = splitPatchRecords(recs, [patch({})], 1000);
		expect(shifted[0]).toHaveLength(1);
	});
});
