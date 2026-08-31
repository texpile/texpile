/* eslint-disable @typescript-eslint/no-explicit-any -- page records are schemaless engine JSON */
import { describe, expect, it } from 'vitest';
import { recordsAfterPatch } from '$lib/draft/patch/recordsAfterPatch';
import { splitPatchRecords } from '$lib/draft/draftPaint';
import { flowDyAt } from '$lib/draft/patch/glueShift';
import type { Patch } from '$lib/draft/patch/patch.types';

// The record store is the only description of the page the locator has, so a wrong entry here
// is not a wrong pixel -- it silently misdirects every later edit. These tests hold the
// derivation to the painter's own composition, which is the one thing that makes the screen
// and the store describe the same document.
const pl = (y: number, s?: number) => ({ t: 'pl', x: 50, y, w: 200, h: 7, d: 2, ...(s === undefined ? {} : { s, sf: 1 }) });
const g = (y: number) => ({ t: 'g', x: 50, y, f: 1, c: 65 });

const PAGE = [
	{ t: 'font', id: 1, size: 10, name: 'cmr10', file: '/f.otf' },
	pl(100, 10),
	g(100),
	pl(112, 10),
	g(112),
	pl(140, 20), // the band
	g(140),
	pl(152, 20),
	g(152),
	pl(180, 30), // below the band
	g(180),
	pl(192, 30)
];

const patch = (over: Partial<Patch> = {}): Patch =>
	({
		top: 140,
		dropTop: 132,
		dropBottom: 154,
		delta: 12,
		paraLeft: 50,
		colL: 40,
		colR: 260,
		// `line`, not `pl`: newRecs IS the daemon's own output, and the daemon has never
		// emitted a pl. Writing the page's vocabulary here made every assertion pass against
		// a record shape production cannot produce, which is how the store lost its line
		// boxes unnoticed. The extra daemon-only fields ride along on purpose.
		newRecs: [
			{ t: 'line', n: 1, x: 0, y: 0, w: 200, h: 7, d: 2, gset: 0, gsign: 0, gord: 0, rdw: 200 },
			{ t: 'g', x: 0, y: 0, f: 1, c: 66 },
			{ t: 'line', n: 2, x: 0, y: 12, w: 200, h: 7, d: 2, gset: 0, gsign: 0, gord: 0, rdw: 200 },
			{ t: 'g', x: 0, y: 12, f: 1, c: 67 },
			{ t: 'line', n: 3, x: 0, y: 24, w: 200, h: 7, d: 2, gset: 0, gsign: 0, gord: 0, rdw: 200 }
		],
		flowBottom: 700,
		...over
	}) as Patch;

describe('recordsAfterPatch', () => {
	it('matches what the painter draws, record for record', () => {
		// the painter's own composition, written out here independently
		const p = patch();
		const { unchanged, shifted } = splitPatchRecords(PAGE, [p], 700);
		const painted = [
			...unchanged.filter((r: any) => r.t !== 'font'),
			...shifted[0].filter((r: any) => r.t !== 'font').map((r: any) => ({ ...r, y: r.y + p.delta })),
			...p.newRecs.map((r: any) => ({ ...r, x: r.x + p.paraLeft, y: r.y + p.top }))
		];
		const out = recordsAfterPatch(PAGE, p, 700, { s: 20, sf: 1 })!;
		// the band's TAG is the one thing that legitimately differs: the painter draws the
		// daemon's records as they came, the store files them in the page's vocabulary
		const positions = (rs: any[]) =>
			rs
				.filter((r: any) => r.t !== 'font')
				.map((r: any) => `${r.t === 'line' ? 'pl' : r.t}@${r.x},${r.y}`)
				.sort();
		expect(positions(out)).toEqual(positions(painted));
	});

	it('files the daemon band as page line boxes, not as daemon ones', () => {
		// the bug this replaced: newRecs are `line` records and went into the store untranslated,
		// so the store held NO pl for the edited paragraph -- a hole every pl consumer reads
		// (pageSkeleton by index range, calVariants, seams, nextSlot, aboveGalley). The page and
		// the screen were both right; the next edit on the page was the one that paid.
		const out = recordsAfterPatch(PAGE, patch(), 700, { s: 20, sf: 1 })!;
		const band = out.filter((r: any) => r.y >= 140 && r.y <= 164 && (r.t === 'pl' || r.t === 'line'));
		expect(band).toHaveLength(3);
		expect(band.every((r: any) => r.t === 'pl')).toBe(true);
		// and the daemon-only fields do not ride into the page's vocabulary
		for (const k of ['n', 'gset', 'gsign', 'gord', 'rdw']) expect(band.some((r: any) => k in r)).toBe(false);
	});

	it('keeps the band where it was in the vertical list', () => {
		// the skeleton reads records by INDEX range, so order is not cosmetic
		const out = recordsAfterPatch(PAGE, patch(), 700, { s: 20, sf: 1 })!;
		const ys = out.filter((r: any) => r.t === 'pl').map((r: any) => r.y);
		expect(ys).toEqual([...ys].sort((a, b) => a - b));
	});

	it('drops the old band and inserts the new one', () => {
		const out = recordsAfterPatch(PAGE, patch(), 700, { s: 20, sf: 1 })!;
		const band = out.filter((r: any) => r.t === 'pl' && r.s === 20);
		expect(band).toHaveLength(3); // was two lines, the edit grew it to three
		expect(band.map((r: any) => r.y)).toEqual([140, 152, 164]);
	});

	it('stamps every new band line with the paragraph source line, as the compiler does', () => {
		const out = recordsAfterPatch(PAGE, patch(), 700, { s: 20, sf: 1 })!;
		for (const r of out.filter((x: any) => x.t === 'pl' && x.y >= 140 && x.y <= 164)) {
			expect(r.s).toBe(20);
			expect(r.sf).toBe(1);
		}
	});

	it('shifts what is below the band by the delta', () => {
		const out = recordsAfterPatch(PAGE, patch(), 700, { s: 20, sf: 1 })!;
		expect(out.filter((r: any) => r.t === 'pl' && r.s === 30).map((r: any) => r.y)).toEqual([192, 204]);
	});

	it('leaves what is above the band untouched', () => {
		const out = recordsAfterPatch(PAGE, patch(), 700, { s: 20, sf: 1 })!;
		expect(out.filter((r: any) => r.t === 'pl' && r.s === 10).map((r: any) => r.y)).toEqual([100, 112]);
	});

	it('follows the certified steps instead of a rigid delta when they are present', () => {
		const steps = [{ y: 160, dy: 4 }];
		const p = patch({ delta: 0, flowSteps: steps });
		const out = recordsAfterPatch(PAGE, p, 700, { s: 20, sf: 1 })!;
		const below = out.filter((r: any) => r.t === 'pl' && r.s === 30).map((r: any) => r.y);
		expect(below).toEqual([180 + flowDyAt(steps, 180, 0), 192 + flowDyAt(steps, 192, 0)]);
	});

	it('declines a patch that carried rows away', () => {
		// a clip means rows left this page; what happened to them is the chain's answer, not
		// this one's, so the caller keeps its recompile
		expect(recordsAfterPatch(PAGE, patch({ clipBottom: 150 }), 700, { s: 20, sf: 1 })).toBeNull();
	});

	it('keeps the font records', () => {
		const out = recordsAfterPatch(PAGE, patch(), 700, { s: 20, sf: 1 })!;
		expect(out.filter((r: any) => r.t === 'font')).toHaveLength(1);
	});
});
