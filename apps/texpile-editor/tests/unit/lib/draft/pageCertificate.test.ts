/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { pageBreakCertificate } from '$lib/draft/patch/pageCertificate';

// The decisions under test: which splits run at which targets (capacity splits carry the
// page-builder depth charge, calibration/layout splits must not), and what a MOVED break
// returns -- the capacity split's motion data when the break lands below the band,
// nothing when it lands inside the band or the page still holds the content.
const pl = (y: number) => ({ t: 'pl', x: 10, y, w: 200, h: 8, d: 3 });
const recs = [pl(100), pl(115), pl(130), pl(145), pl(160)];
const line = (y: number) => ({ t: 'line', y, h: 8, d: 3 });
const cal = { pageNo: 1, b1: 115, bk: 130, medGap: 15, paraLeft: 10, W: 200, colL: -5, colR: 220 } as any;
// top = 92, target = 68; colBottom 175 -> capacity 83
const COL_BOTTOM = 175;
const CAL_OK = { ok: true, kA: 5, kB: 0, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53, 68] };

function deps(results: any[], calls: string[] = []) {
	return {
		pageRecords: () => recs as any[],
		splitSkeleton: (_items: any[], targetPt: number, capacity?: boolean) => {
			calls.push(`${+targetPt.toFixed(2)}${capacity ? ' cap' : ''}`);
			return Promise.resolve(results.shift());
		},
		emit: () => {}
	};
}

describe('pageBreakCertificate break motion', () => {
	it('same count, break moved below the band: the capacity split names the motion', async () => {
		const calls: string[] = [];
		const cert = await pageBreakCertificate(
			deps(
				[
					CAL_OK,
					{ ok: true, kA: 4, kB: 1, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53] },
					{ ok: true, kA: 4, kB: 1, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 55] }
				],
				calls
			),
			cal,
			[line(8), line(23)],
			COL_BOTTOM
		);
		expect(calls).toEqual(['68', '68', '83 cap']); // calibrate, old target, capacity
		expect(cert!.fits).toBe(false);
		expect(cert!.moved!.movedBases).toEqual([160]);
		expect(cert!.moved!.clipY).toBeCloseTo(150, 4); // between 145+3 and 160-8
		expect(cert!.moved!.bandAbsYs.map((y) => +y.toFixed(2))).toEqual([115, 130]);
		expect(cert!.moved!.staySteps).toHaveLength(1);
		expect(cert!.moved!.staySteps[0].y).toBeCloseTo(136.99, 4); // box top of the 145 line
		expect(cert!.moved!.staySteps[0].dy).toBeCloseTo(2, 4); // 92 + 55 - 145
	});

	it('extent grew inside the page capacity: no motion to render', async () => {
		const cert = await pageBreakCertificate(
			deps([
				CAL_OK,
				{ ok: true, kA: 4, kB: 1, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53] },
				{ ok: true, kA: 5, kB: 0, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53, 70] }
			]),
			cal,
			[line(8), line(23)],
			COL_BOTTOM
		);
		expect(cert!.fits).toBe(false);
		expect(cert!.moved).toBeUndefined();
	});

	it('break inside the band: refuse the motion, keep the honest fits:false', async () => {
		const cert = await pageBreakCertificate(
			deps([
				CAL_OK,
				{ ok: true, kA: 2, kB: 3, gs: 0, gsn: 0, go: 0, ys: [8, 23] },
				{ ok: true, kA: 2, kB: 3, gs: 0, gsn: 0, go: 0, ys: [8, 23] }
			]),
			cal,
			[line(8), line(23)],
			COL_BOTTOM
		);
		expect(cert!.fits).toBe(false);
		expect(cert!.moved).toBeUndefined();
	});

	it('grown band past capacity: motion carries the below-band tail', async () => {
		const calls: string[] = [];
		const cert = await pageBreakCertificate(
			deps([CAL_OK, { ok: true, kA: 4, kB: 2, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53] }], calls),
			cal,
			[line(8), line(23), line(38)],
			COL_BOTTOM
		);
		expect(calls).toEqual(['68', '83 cap']); // calibrate, capacity fit
		expect(cert!.fits).toBe(false);
		expect(cert!.moved!.movedBases).toEqual([145, 160]);
		expect(cert!.moved!.staySteps).toEqual([]); // nothing below the band stays
		expect(cert!.moved!.clipY).toBeCloseTo(135, 4); // between the band bottom 133 and 145-8
		expect(cert!.moved!.bandAbsYs.map((y) => +y.toFixed(2))).toEqual([115, 130, 145]);
	});

	it('grown band, one below-band box stays: the old/new index remap holds', async () => {
		// band grows 2 -> 3 lines (new indices shift by +1): the staying box's step and the
		// carried box's identity must come from OLD indices, not the spliced ones
		const cert = await pageBreakCertificate(
			deps([CAL_OK, { ok: true, kA: 5, kB: 1, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53, 68] }]),
			cal,
			[line(8), line(23), line(38)],
			COL_BOTTOM
		);
		expect(cert!.fits).toBe(false);
		expect(cert!.moved!.movedBases).toEqual([160]); // old box 4 carries
		expect(cert!.moved!.staySteps).toHaveLength(1); // old box 3 stays
		expect(cert!.moved!.staySteps[0].y).toBeCloseTo(136.99, 4); // its OLD box top
		expect(cert!.moved!.staySteps[0].dy).toBeCloseTo(15, 4); // 92 + 68 - 145
		expect(cert!.moved!.clipY).toBeCloseTo(150, 4);
		expect(cert!.moved!.bandAbsYs.map((y) => +y.toFixed(2))).toEqual([115, 130, 145]);
	});

	it('grown band that still fits: fit-only certificate, no motion', async () => {
		const cert = await pageBreakCertificate(
			deps([CAL_OK, { ok: true, kA: 6, kB: 0, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53, 68, 83] }]),
			cal,
			[line(8), line(23), line(38)],
			COL_BOTTOM
		);
		expect(cert!.fits).toBe(true);
		expect(cert!.moved).toBeUndefined();
	});
});
