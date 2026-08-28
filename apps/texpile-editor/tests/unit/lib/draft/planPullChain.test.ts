/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { planPullChain } from '$lib/draft/heuristics/planPullChain';
import type { SeamEntry } from '$lib/draft/patch/seam.types';

// The decisions under test: the pull is the ENGINE's answer (the capacity split over
// [shrunk column + seam + donor] names how many donor boxes climb back), the donor's
// pulled region is wiped while its rest respaces on certified baselines, and a chain
// with no certifiable answer returns null so today's shrink render stands.
const g = (x: number, y: number) => ({ t: 'g', c: 65, f: 1, x, y, w: 5 });
const pl = (x: number, y: number) => ({ t: 'pl', x, y, w: 200, h: 8, d: 3 });
const b = { t: 'b', h: 8, d: 3 } as any;
const g4 = { t: 'g', w: 4, st: 0, sto: 0, sh: 0, sho: 0 } as any;
// edit column: five 15pt-pitch lines from baseline 100; band = boxes 1..2, shrunk to ONE
// daemon line. top 92; capacity to the 170 body bottom = 78.
const skel = {
	items: [b, g4, b, g4, b, g4, b, g4, b],
	boxYs: [100, 115, 130, 145, 160],
	boxHs: [8, 8, 8, 8, 8],
	boxIdx: [0, 2, 4, 6, 8],
	top: 92,
	target: 68
};
const seed = { skel, items: [b, g4, b, g4, b, g4, b], top: 92, fromBox: 1, toBox: 2, bandBoxes: 1, boxesAfter: 4 } as any;
const cal = { pageNo: 1, b1: 115, bk: 130, medGap: 15, paraLeft: 57, W: 200, colL: 49, colR: 265 } as any;
const geom = { y0: 8, h1: 8, dk: 3, floorA: 172 };
const daemonRecs = [{ t: 'line', y: 8, h: 8, d: 3 }, g(57, 8)] as any[];
const col1 = [pl(57, 100), g(57, 100), g(57, 145), g(57, 160)];
const col2 = [pl(267, 80), pl(267, 95), g(267, 80), g(350, 80), g(267, 95)];
const seam11: SeamEntry = { page: 1, col: 1, pen: 150, run: [{ p: 10000 }, { w: 5, st: 0, sto: 0, sh: 0, sho: 0 }] };
const seam12: SeamEntry = { page: 1, col: 2, pen: 0, run: [{ p: 10000 }, { w: 6, st: 0, sto: 0, sh: 0, sho: 0 }] };
const ok = (kA: number, kB: number, ys: number[], go = 0) => ({ ok: true, kA, kB, gs: 0, gsn: 0, go, ys });

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
		columnFills: () => opts.packs !== false,
		pageIsRtl: () => !!opts.rtl,
		emit: () => {}
	};
}

describe('planPullChain', () => {
	it('one donor line climbs back; the donor wipes its head and respaces exactly', async () => {
		const calls: string[] = [];
		const plan = (await planPullChain(
			deps([ok(2, 0, [8, 23]), ok(5, 1, [8, 23, 38, 53, 68]), ok(1, 0, [8], 1)], calls, [seam11, seam12]),
			ctx({ 1: [...col1, ...col2] }, 1),
			cal,
			daemonRecs,
			seed,
			geom,
			10
		))!;
		// donor calibrates, the pull split answers, the emptied donor respaces alone
		expect(calls).toEqual(['23', '78 cap', '98 cap']);
		expect(plan.exact).toBe(true);
		expect(plan.pulled).toBe(1);
		expect(plan.hops).toBe(1);
		expect(plan.pages).toHaveLength(1);
		const [segA, insert, wipe] = plan.pages[0].segs;
		// below-band content climbs one 15pt line on certified steps
		expect(segA.flowSteps!.map((s: any) => +s.dy.toFixed(2))).toEqual([-15, -15]);
		expect(segA.delta).toBe(0);
		// the pulled donor row (both its glyphs) lands in the freed last-line slot,
		// keyed to the EDIT column's window
		expect(insert.newRecs.filter((r: any) => r.y !== undefined).map((r: any) => r.y)).toEqual([160, 160]);
		expect(insert.paraLeft).toBe(-(267 - 57));
		expect(insert.colL).toBe(49);
		// the donor wipes exactly the pulled region and its rest climbs to the body top
		expect(wipe.colL).toBe(259);
		expect(wipe.dropTop).toBeCloseTo(68, 4);
		expect(wipe.dropBottom).toBeCloseTo(85, 4);
		expect(wipe.flowSteps).toEqual([{ y: 86.99, dy: -15 }]);
		expect(wipe.newRecs).toEqual([]);
	});

	it('the engine can refuse the pull: the column respaces and the donor is untouched', async () => {
		const calls: string[] = [];
		const plan = (await planPullChain(
			deps([ok(2, 0, [8, 23]), ok(4, 2, [8, 23, 38, 53])], calls, [seam11, seam12]),
			ctx({ 1: [...col1, ...col2] }, 1),
			cal,
			daemonRecs,
			seed,
			geom,
			10
		))!;
		expect(calls).toEqual(['23', '78 cap']);
		expect(plan.pulled).toBe(0);
		expect(plan.hops).toBe(0);
		expect(plan.exact).toBe(true);
		expect(plan.pages[0].segs).toHaveLength(1);
	});

	it('no captured seam: null, so the un-pulled shrink render stands', async () => {
		const calls: string[] = [];
		expect(await planPullChain(deps([], calls), ctx({ 1: [...col1, ...col2] }, 1), cal, daemonRecs, seed, geom, 10)).toBeNull();
		expect(calls).toEqual([]);
	});

	it('document-last column: exact only when trailing fil absorbed the freed room', async () => {
		const soaked = (await planPullChain(deps([ok(4, 0, [8, 23, 38, 53], 1)]), ctx({ 1: col1 }, 1), cal, daemonRecs, seed, geom, 10))!;
		expect(soaked.exact).toBe(true);
		expect(soaked.hops).toBe(0);
		const rigid = (await planPullChain(deps([ok(4, 0, [8, 23, 38, 53], 0)]), ctx({ 1: col1 }, 1), cal, daemonRecs, seed, geom, 10))!;
		expect(rigid.exact).toBe(false);
	});
});
