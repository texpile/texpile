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
	pageRecords: () => [],
	topSkip: 11
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

	it('seats the spill by the landing rule when its first line grew taller', () => {
		// an inline-math line arriving at the head of the spill: the receiving column seats its
		// first baseline max(\topskip, height) below the same top, so the whole fragment starts
		// lower and everything under it moves with it. Measured on bert as 15.6pt of drift the
		// render drew anyway, because only the exactness CHECK knew this rule.
		const tall = lineRecs.map((r, i) => (i === 7 ? { ...r, h: 26.6 } : r));
		const s = buildColumnSplit(CAL, [records[0], ...tall], tall, { ...DEPS, at: 7 });
		// spill.b1 1.8 was seated at max(11, 7.7) = 11, the new head at max(11, 26.6) = 26.6
		const shift = 26.6 - 11;
		expect(s.segB.top).toBeCloseTo(1.8 + shift - tall[7].y, 4);
		// content below the spill moves by the landing shift too, not only by the span change
		expect(s.segB.delta).toBeCloseTo(tall[16].y - tall[7].y - (124 - 1.8) + shift, 4);
	});

	it('leaves the spill where it was when its first line did not change the landing', () => {
		// both heights below \topskip: the rule seats them identically, so nothing shifts
		const s = buildColumnSplit(CAL, records, lineRecs, { ...DEPS, at: 7 });
		expect(s.segB.top).toBeCloseTo(1.8 - lineRecs[7].y, 4);
	});

	it('cannot difference a landing it was never told: no shift', () => {
		// an older locate that recorded no spill h1. Guessing the column top to recover it would
		// be inventing page geometry, so the render stays where it was and splitExact refuses.
		const noH1 = { ...CAL, spill: { ...CAL.spill, h1: undefined } };
		const tall = lineRecs.map((r, i) => (i === 7 ? { ...r, h: 26.6 } : r));
		const s = buildColumnSplit(noH1, [records[0], ...tall], tall, { ...DEPS, at: 7 });
		expect(s.segB.top).toBeCloseTo(1.8 - tall[7].y, 4);
	});

	it('a paragraph that shrank past the stated cut no longer spills', () => {
		const short = lineRecs.slice(0, 5);
		const s = buildColumnSplit(CAL, [records[0], ...short], short, { ...DEPS, at: 7 });
		expect(s.kA).toBe(5);
		expect(s.segB.newRecs).toEqual([]);
	});
});
