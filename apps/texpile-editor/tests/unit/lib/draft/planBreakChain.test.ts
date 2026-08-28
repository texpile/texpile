/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { planBreakChain } from '$lib/draft/heuristics/planBreakChain';
import type { SeamEntry } from '$lib/draft/patch/seam.types';

// The decisions under test: a hop is certified only through its own calibration +
// capacity split over [carried + captured seam + column], absorption is confirmed by the
// pull probe (or the document simply ending), and any uncertifiable hop renders the
// first-order segment and keeps the tint. Forced seams refuse the whole chain.
const g = (x: number, y: number) => ({ t: 'g', c: 65, f: 1, x, y, w: 5 });
const pl = (x: number, y: number) => ({ t: 'pl', x, y, w: 200, h: 8, d: 3 });
const cal = { pageNo: 1, b1: 115, bk: 130, medGap: 15, paraLeft: 57, W: 200, colL: 49, colR: 265 } as any;
const motion = {
	bandAbsYs: [115, 130],
	staySteps: [{ y: 136.99, dy: 2 }],
	movedBases: [160],
	carriedItems: [{ t: 'b', h: 8, d: 3 }] as any[],
	clipY: 150,
	maxAboveDy: 0
};
const geom = { y0: 8, h1: 8, dk: 3, floorA: 172 };
const bandRecs = [g(57, 8)] as any[];
const col1 = [pl(57, 80), g(57, 80), g(57, 95), g(57, 145), g(57, 160)];
// second column: two engine-broken lines (skeleton: b(8,3), rigid 4, b(8,3); top 72,
// target 23) plus a far-right glyph proving the column to nextSlot's arithmetic
const col2 = [pl(267, 80), pl(267, 95), g(267, 80), g(350, 80), g(267, 95)];
const seam11: SeamEntry = { page: 1, col: 1, pen: 150, run: [{ p: 10000 }, { w: 5, st: 0, sto: 0, sh: 0, sho: 0 }] };
const seam12: SeamEntry = { page: 1, col: 2, pen: 0, run: [{ p: 10000 }, { w: 6, st: 0, sto: 0, sh: 0, sho: 0 }] };
const ok = (kA: number, kB: number, ys: number[]) => ({ ok: true, kA, kB, gs: 0, gsn: 0, go: 0, ys });

function ctx(pages: Record<number, any[]>, count: number) {
	return {
		pageRecords: (n: number) => pages[n] ?? [],
		contentFloor: () => 172,
		pageCount: () => count,
		colSep: 10
	};
}

function deps(results: any[], calls: string[] = [], seams: SeamEntry[] = [], opts: { packs?: boolean; rtl?: boolean } = {}) {
	return {
		splitSkeleton: (_items: any[], t: number, cap?: boolean) => {
			calls.push(`${+t.toFixed(2)}${cap ? ' cap' : ''}`);
			return Promise.resolve(results.shift());
		},
		seams: () => seams,
		colBottomOf: () => 170,
		packsToGoal: () => opts.packs !== false,
		pageIsRtl: () => !!opts.rtl,
		emit: () => {}
	};
}

describe('planBreakChain', () => {
	it('certified hop absorbed on the document last column: exact, no probe needed', async () => {
		const calls: string[] = [];
		const plan = (await planBreakChain(
			deps([ok(2, 0, [8, 23]), ok(3, 0, [8, 24, 39])], calls, [seam11, seam12]),
			ctx({ 1: [...col1, ...col2] }, 1),
			cal,
			bandRecs,
			motion,
			geom,
			10
		))!;
		expect(calls).toEqual(['23', '98 cap']); // receiving column calibrates, then the hop split
		expect(plan.exact).toBe(true);
		expect(plan.hops).toBe(1);
		expect(plan.samePage).toBe(true);
		expect(plan.pages).toHaveLength(1);
		const [segA, hop] = plan.pages[0].segs;
		expect(segA.clipBottom).toBe(150);
		expect(segA.delta).toBe(0);
		expect(segA.newRecs).toBe(bandRecs);
		// carried row lands on the engine's certified baseline at the slot top
		expect(hop.newRecs.filter((r: any) => r.y !== undefined).map((r: any) => r.y)).toEqual([80]);
		expect(hop.top).toBe(0);
		expect(hop.paraLeft).toBe(267 - 57);
		expect(hop.colL).toBe(259);
		expect(hop.dropTop).toBeCloseTo(68, 4); // body top - 2: wipe nothing
		// the slot's own boxes move by the split's certified respace, not a rigid guess
		expect(hop.delta).toBeCloseTo(16, 4);
		expect(hop.flowSteps).toEqual([
			{ y: 71.99, dy: 16 },
			{ y: 86.99, dy: 16 }
		]);
		expect(hop.clipBottom).toBeUndefined();
		expect(hop.flowBottom).toBe(172);
	});

	it('absorbed but the pull probe says the engine would pull the next line up: tinted', async () => {
		const calls: string[] = [];
		const page2 = [pl(57, 80), g(57, 80)];
		const plan = (await planBreakChain(
			deps([ok(2, 0, [8, 23]), ok(3, 0, [8, 24, 39]), ok(4, 0, [8, 24, 39, 54])], calls, [seam11, seam12]),
			ctx({ 1: [...col1, ...col2], 2: page2 }, 2),
			cal,
			bandRecs,
			motion,
			geom,
			10
		))!;
		expect(calls).toEqual(['23', '98 cap', '98 cap']); // the probe offered one more box and it FIT
		expect(plan.exact).toBe(false);
		expect(plan.hops).toBe(1);
	});

	it('kB>0 chains a second certified hop onto the next page', async () => {
		const calls: string[] = [];
		const page2 = [pl(57, 80), pl(57, 95), g(57, 80), g(57, 95)];
		const plan = (await planBreakChain(
			deps([ok(2, 0, [8, 23]), ok(2, 1, [8, 24]), ok(2, 0, [8, 23]), ok(3, 0, [8, 25, 40])], calls, [seam11, seam12]),
			ctx({ 1: [...col1, ...col2], 2: page2 }, 2),
			cal,
			bandRecs,
			motion,
			geom,
			10
		))!;
		expect(calls).toEqual(['23', '98 cap', '23', '98 cap']);
		expect(plan.exact).toBe(true); // hop 2 absorbed; the document ends there, nothing to pull
		expect(plan.hops).toBe(2);
		expect(plan.samePage).toBe(false);
		expect(plan.endPage).toBe(2);
		const hop1 = plan.pages[0].segs[1];
		// one of the slot's two boxes stays (respaced), the other carries onward: the clip
		// separates them at the old boundary, offset by the patch's rigid delta
		expect(hop1.delta).toBeCloseTo(16, 4);
		expect(hop1.flowSteps).toEqual([{ y: 71.99, dy: 16 }]);
		expect(hop1.clipBottom).toBeCloseTo(85 + 16, 4);
		expect(plan.pages[1].page).toBe(2);
		const hop2 = plan.pages[1].segs[0];
		// the carried row from column 2 lands on page 2's certified body-top baseline
		expect(hop2.newRecs.filter((r: any) => r.y !== undefined).map((r: any) => r.y)).toEqual([80]);
		expect(hop2.paraLeft).toBe(57 - 267);
		expect(hop2.delta).toBeCloseTo(17, 4);
	});

	it('no seam captured: one first-order hop, tinted, no engine splits', async () => {
		const calls: string[] = [];
		const plan = (await planBreakChain(deps([], calls), ctx({ 1: [...col1, ...col2] }, 1), cal, bandRecs, motion, geom, 10))!;
		expect(calls).toEqual([]);
		expect(plan.exact).toBe(false);
		expect(plan.hops).toBe(1);
		const legacy = plan.pages[0].segs[1];
		expect(legacy.top).toBeCloseTo(80 - 160, 4);
		expect(legacy.delta).toBeCloseTo(15, 4); // baseline pitch (zero span) + medGap guess
		expect(legacy.paraLeft).toBe(267 - 57);
		expect(legacy.newRecs.filter((r: any) => r.y !== undefined).map((r: any) => r.y)).toEqual([160]);
	});

	it('a forced break (\\newpage) refuses the chain outright', async () => {
		const forced: SeamEntry = { ...seam11, pen: -10000 };
		expect(
			await planBreakChain(deps([], [], [forced, seam12]), ctx({ 1: [...col1, ...col2] }, 1), cal, bandRecs, motion, geom, 10)
		).toBeNull();
	});

	it('a visible above-band repack refuses the plan: the render would lie about that seam', async () => {
		const shifted = { ...motion, maxAboveDy: 3 };
		expect(await planBreakChain(deps([]), ctx({ 1: [...col1, ...col2] }, 1), cal, bandRecs, shifted, geom, 10)).toBeNull();
	});

	it('no next slot (last page of the document): no plan', async () => {
		expect(await planBreakChain(deps([]), ctx({ 1: col1 }, 1), cal, bandRecs, motion, geom, 10)).toBeNull();
	});

	it('a ragged receiving page keeps the tint: its rows are not packed to the goal', async () => {
		const plan = (await planBreakChain(
			deps([ok(2, 0, [8, 23]), ok(3, 0, [8, 24, 39])], [], [seam11, seam12], { packs: false }),
			ctx({ 1: [...col1, ...col2] }, 1),
			cal,
			bandRecs,
			motion,
			geom,
			10
		))!;
		expect(plan.hops).toBe(1);
		expect(plan.exact).toBe(false);
	});

	it('an RTL receiving page takes no patch ink at all: no plan', async () => {
		expect(
			await planBreakChain(
				deps([], [], [seam11, seam12], { rtl: true }),
				ctx({ 1: [...col1, ...col2] }, 1),
				cal,
				bandRecs,
				motion,
				geom,
				10
			)
		).toBeNull();
	});
});
