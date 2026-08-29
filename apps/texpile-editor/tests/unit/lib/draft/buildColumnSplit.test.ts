import { describe, expect, it } from 'vitest';
import { buildColumnSplit } from '$lib/draft/heuristics/buildColumnSplit';
import type { Cal } from '$lib/draft/locate/locate.types';

// The decision under test: which answer decides where the straddling paragraph is cut. The
// page body's floor is not where a column ends when a float sits under it, so a capacity or
// \vsplit answer measured against it can pack many more lines into the hole than fit.
const CAL: Cal & { spill: NonNullable<Cal['spill']> } = {
	pageNo: 1,
	b1: 488,
	bk: 570,
	medGap: 13.6,
	paraLeft: 0,
	W: 219,
	colL: 0,
	colR: 219,
	spill: { b1: 1.8, bk: 124, colL: 236, colR: 455, paraLeft: 0, h1: 7.7 }
};
const lineRecs = Array.from({ length: 17 }, (_, i) => ({ t: 'line', y: i * 13.6, h: 7.7, d: 2.2 }));
const records = [{ t: 'font', id: 1, size: 10 }, ...lineRecs];
const DEPS = {
	h1: 7.7,
	dk: 2.2,
	// the page BODY runs to 690 while this column's text stops at 570: a bottom float holds
	// the rest, and nothing in the page metadata says so
	colBottom: 690,
	contentFloorOf: () => 692,
	pageRecords: () => []
};

describe('buildColumnSplit', () => {
	it('cuts where the page cut, when the stamp says where that was', () => {
		const s = buildColumnSplit(CAL, records, lineRecs, { ...DEPS, at: 7 });
		expect(s.kA).toBe(7);
		// the remaining ten open column B
		expect((s.segB.newRecs ?? []).filter((r) => (r as { t: string }).t === 'line')).toHaveLength(10);
	});

	it('measured against the page floor instead, the cut overshoots the column', () => {
		// the same paragraph, same page, no stamp: capacity from the body floor claims room for
		// almost the whole paragraph in a hole that held seven lines
		const s = buildColumnSplit(CAL, records, lineRecs, DEPS);
		expect(s.kA).toBeGreaterThan(7);
	});

	it('a paragraph that shrank past the stated cut no longer spills', () => {
		const short = lineRecs.slice(0, 5);
		const s = buildColumnSplit(CAL, [records[0], ...short], short, { ...DEPS, at: 7 });
		expect(s.kA).toBe(5);
		expect(s.segB.newRecs).toEqual([]);
	});
});
