/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { planBreakMotion } from '$lib/draft/heuristics/planBreakMotion';

// The decisions under test: carried rows are picked by the engine's clip boundary (not
// slack arithmetic), the slot comes from reading order, and the seam stays a guess.
const g = (x: number, y: number) => ({ t: 'g', c: 65, f: 1, x, y, w: 5 });
const cal = { pageNo: 1, b1: 115, bk: 130, medGap: 15, paraLeft: 57, W: 200, colL: 49, colR: 265 } as any;
const motion = {
	bandAbsYs: [115, 130],
	staySteps: [{ y: 136.99, dy: 2 }],
	movedBases: [160],
	clipY: 150,
	maxAboveDy: 0
};
const geom = { y0: 8, h1: 8, dk: 3, floorA: 172 };
const bandRecs = [g(57, 8)] as any[];
// column 1 rows plus a proven second column (content past its origin) with its body top
const col1 = [g(57, 80), g(57, 95), g(57, 145), g(57, 160)];
const col2 = [g(267, 80), g(350, 80), g(267, 95), g(267, 110), { t: 'pl', x: 267, y: 80, w: 200, h: 8, d: 3 }];

function ctx(pages: Record<number, any[]>, count: number) {
	return {
		pageRecords: (n: number) => pages[n] ?? [],
		contentFloor: () => 172,
		pageCount: () => count,
		colSep: 10
	};
}

describe('planBreakMotion', () => {
	it('same page: carried rows re-draw at the next column top, staying rows keep engine steps', () => {
		const plan = planBreakMotion(ctx({ 1: [...col1, ...col2] }, 1), cal, bandRecs, motion, geom)!;
		expect(plan.samePage).toBe(true);
		expect(plan.spillPage).toBe(1);
		expect(plan.carried).toBe(1);
		// the engine's boundary picks exactly the y=160 row, not the y=145 one
		expect(plan.segA.clipBottom).toBe(150);
		expect(plan.segA.delta).toBe(0);
		expect(plan.segA.flowSteps).toEqual(motion.staySteps);
		expect(plan.segA.newRecs).toBe(bandRecs);
		expect(plan.segB.newRecs.filter((r: any) => r.y !== undefined).map((r: any) => r.y)).toEqual([160]);
		// first carried baseline lands on the slot's own body-top baseline (80)
		expect(plan.segB.top).toBeCloseTo(80 - 160, 4);
		expect(plan.segB.paraLeft).toBe(267 - 57);
		expect(plan.segB.colL).toBe(259);
		// one carried line pushes the slot's content down by ONE line: baseline pitch
		// (zero span) plus the seam gap, not the line's box extent
		expect(plan.segB.delta).toBeCloseTo(15, 4);
		expect(plan.segB.flowBottom).toBe(172);
	});

	it('a visible above-band repack refuses the plan: the render would lie about that seam', () => {
		const shifted = { ...motion, maxAboveDy: 3 };
		expect(planBreakMotion(ctx({ 1: [...col1, ...col2] }, 1), cal, bandRecs, shifted, geom)).toBeNull();
	});

	it('single column: the carry routes to the next page, keeping its x', () => {
		const page2 = [g(57, 80), g(57, 95), g(57, 110), { t: 'pl', x: 57, y: 80, w: 200, h: 8, d: 3 }];
		const plan = planBreakMotion(ctx({ 1: col1, 2: page2 }, 2), cal, bandRecs, motion, geom)!;
		expect(plan.samePage).toBe(false);
		expect(plan.spillPage).toBe(2);
		expect(plan.segB.paraLeft).toBe(0);
		expect(plan.segB.top).toBeCloseTo(80 - 160, 4);
	});

	it('no next slot (last page of the document): no plan', () => {
		expect(planBreakMotion(ctx({ 1: col1 }, 1), cal, bandRecs, motion, geom)).toBeNull();
	});
});
