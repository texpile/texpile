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
			COL_BOTTOM,
			10
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
			COL_BOTTOM,
			10
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
			COL_BOTTOM,
			10
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
			COL_BOTTOM,
			10
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
			COL_BOTTOM,
			10
		);
		expect(cert!.fits).toBe(false);
		expect(cert!.moved!.movedBases).toEqual([160]); // old box 4 carries
		expect(cert!.moved!.staySteps).toHaveLength(1); // old box 3 stays
		expect(cert!.moved!.staySteps[0].y).toBeCloseTo(136.99, 4); // its OLD box top
		expect(cert!.moved!.staySteps[0].dy).toBeCloseTo(15, 4); // 92 + 68 - 145
		expect(cert!.moved!.clipY).toBeCloseTo(150, 4);
		expect(cert!.moved!.bandAbsYs.map((y) => +y.toFixed(2))).toEqual([115, 130, 145]);
	});

	it('editing the column FIRST line re-anchors on the topskip landing rule', async () => {
		// band = boxes 0..1; the new first line is taller (12 vs 8), so the engine packs the
		// column 2pt higher: bodyTop 90 = 100 - max(topskip 10, 8), new top = 90 + 12 - 12.
		// Every certified baseline and the split targets must follow that top, or the whole
		// column renders 2pt low while claiming to be exact.
		const calls: string[] = [];
		const first = { ...cal, b1: 100, bk: 115 };
		const cert = await pageBreakCertificate(
			deps([CAL_OK, { ok: true, kA: 5, kB: 0, gs: 0, gsn: 0, go: 0, ys: [12, 27, 42, 57, 70] }], calls),
			first,
			[{ t: 'line', y: 12, h: 12, d: 3 }, line(27)],
			COL_BOTTOM,
			10
		);
		expect(calls).toEqual(['68', '70']); // calibrate at the old target, re-split at 160 - 90
		expect(cert!.fits).toBe(true);
		expect(cert!.bandAbsYs!.map((y) => +y.toFixed(2))).toEqual([102, 117]);
		// the last box lands back on its own 160 baseline: the page bottom pins it
		expect(cert!.steps!.at(-1)!.dy).toBeCloseTo(0, 4);
	});

	it('grown band that still fits: fit-only certificate, no motion', async () => {
		const cert = await pageBreakCertificate(
			deps([CAL_OK, { ok: true, kA: 6, kB: 0, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53, 68, 83] }]),
			cal,
			[line(8), line(23), line(38)],
			COL_BOTTOM,
			10
		);
		expect(cert!.fits).toBe(true);
		expect(cert!.moved).toBeUndefined();
		// room under the extent: where the growth went is the full pass's answer, not this one
		expect(cert!.bandAbsYs).toBeUndefined();
	});

	it('a column already ON the body bottom certifies its grown layout, not just the fit', async () => {
		// colBottom AT the last baseline: nothing under the extent for the growth to go into,
		// so the capacity split and the layout split are one question and its answer is the
		// engine's baselines. Without them the render fell back to the JS overflow arithmetic,
		// which moved a band the engine had just said stays put (measured 13.6pt, one blSkip).
		const calls: string[] = [];
		const cert = await pageBreakCertificate(
			deps([CAL_OK, { ok: true, kA: 6, kB: 0, gs: 0, gsn: 0, go: 0, ys: [8, 21, 34, 47, 58, 68] }], calls),
			cal,
			[line(8), line(23), line(38)],
			160,
			10
		);
		expect(calls).toEqual(['68', '68 cap']); // calibrate, then the one split that answers both
		expect(cert!.fits).toBe(true);
		expect(cert!.bandAbsYs!.map((y) => +y.toFixed(2))).toEqual([113, 126, 139]);
		// below-band boxes respace by the engine's own numbers, thresholded at their OLD tops
		expect(cert!.steps!.map((s) => +s.dy.toFixed(2))).toEqual([5, 0]);
		expect(cert!.steps![0].y).toBeCloseTo(136.99, 4);
		// the page bottom pins the last box, so nothing above the band had to move
		expect(cert!.maxAboveDy).toBeCloseTo(0, 4);
	});
});

describe('pageBreakCertificate column geometry', () => {
	const run = (records: any[], results: any[], calls: string[] = [], band = [line(8), line(23), line(38)]) =>
		pageBreakCertificate(
			{
				pageRecords: () => records,
				splitSkeleton: (_i: any[], t: number, capacity?: boolean) => {
					calls.push(`${+t.toFixed(2)}${capacity ? ' cap' : ''}`);
					return Promise.resolve(results.shift());
				},
				emit: () => {}
			} as any,
			cal,
			band,
			COL_BOTTOM,
			10
		);
	const spills = { ok: true, kA: 5, kB: 1, gs: 0, gsn: 0, go: 0, ys: [8, 23, 38, 53, 68] };

	it('a float pinned at the column foot is not room for the text', async () => {
		// column box 92 -> 175, galley ending at 163, then 4pt of separation and an 8pt float
		const footFloat = [
			{ t: 'col', x: 10, y: 175, h: 83, d: 0, w: 200, gord: 0 },
			...recs,
			{ t: 'vg', x: 10, y: 163, w: 4, nw: 4 },
			{ t: 'vbox', x: 10, y: 175, h: 8, d: 0, w: 200 },
			{ t: 'colend' }
		];
		const calls: string[] = [];
		await run(footFloat, [CAL_OK, spills], calls);
		// 83 - 12: the fit split is asked about the room the galley actually has. Measured to
		// the body bottom it answered "fits" on a column that overflows, and a fits answer
		// suppresses the spill render outright.
		expect(calls).toEqual(['68', '71 cap']);
	});

	it('trailing glue is the column own slack, not something pinned', async () => {
		// no box under the galley: 12pt of glue the text may legitimately grow into. Charging
		// the galley for it refused certificates on columns with nothing pinned at all, and
		// cost more correct renders than the float case ever gained.
		const slack = [
			{ t: 'col', x: 10, y: 175, h: 83, d: 0, w: 200, gord: 0 },
			...recs,
			{ t: 'vg', x: 10, y: 163, w: 12, nw: 12 },
			{ t: 'colend' }
		];
		const calls: string[] = [];
		await run(slack, [CAL_OK, spills], calls);
		expect(calls).toEqual(['68', '83 cap']);
	});

	it('a column whose foot will not model keeps the old reading rather than inventing one', async () => {
		// no colend: the run cannot be reconstructed to the column bottom, so nothing is
		// subtracted and the capacity is what it always was
		const torn = [{ t: 'col', x: 10, y: 175, h: 83, d: 0, w: 200, gord: 0 }, ...recs];
		const calls: string[] = [];
		await run(torn, [CAL_OK, spills], calls);
		expect(calls).toEqual(['68', '83 cap']);
	});

	it('a same-count edit on a column the engine left short reads it at natural glue', async () => {
		// gord 2 = a fil took the slack, so the column stacks at natural and the stretched
		// reading would spread its rows. The grown branch has always made this distinction;
		// the same-count branch -- typing inside a line, the commonest edit there is -- did not.
		const ragged = [{ t: 'col', x: 10, y: 175, h: 83, d: 0, w: 200, gord: 2 }, ...recs, { t: 'colend' }];
		const stretchedAndNatural = {
			ok: true,
			kA: 5,
			kB: 0,
			gs: 0,
			gsn: 0,
			go: 0,
			ys: [8, 28, 48, 68, 88],
			nys: [8, 23, 38, 53, 68]
		};
		// the calibration splits the unedited column at its own natural extent, so it packs at
		// natural either way; only the LAYOUT split, handed an edited band, has slack to set
		const cert = await run(ragged, [CAL_OK, stretchedAndNatural], [], [line(8), line(23)]);
		expect(cert!.fits).toBe(true);
		// natural: every box back where the page has it. The stretched reading would have
		// reported the column spread and the band 5pt low.
		expect(cert!.bandAbsYs!.map((y) => +y.toFixed(2))).toEqual([115, 130]);
		expect(cert!.maxAboveDy).toBeCloseTo(0, 4);
	});
});
