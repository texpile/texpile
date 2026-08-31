/* eslint-disable @typescript-eslint/no-explicit-any -- page records are schemaless engine JSON */
import { describe, expect, it } from 'vitest';
import { certifiedFlow } from '$lib/draft/patch/certifiedFlow';
import { splitPatchRecords } from '$lib/draft/draftPaint';
import { recordsAfterPatch } from '$lib/draft/patch/recordsAfterPatch';
import type { Patch } from '$lib/draft/patch/patch.types';

// A band that grows pushes the rows OVER it up as surely as the ones under it down: the
// engine respaces the whole column. Those displacements were always computed and then
// reduced to maxAboveDy and dropped, because the painter had nothing that could move that
// region -- which is what a `unset-glue` tint on a column reaching the page bottom was.

// five lines at 100/115/130/145/160, band = boxes 1..2
const skel = {
	boxYs: [100, 115, 130, 145, 160],
	boxHs: [8, 8, 8, 8, 8],
	boxIdx: [0, 1, 2, 3, 4],
	items: [],
	top: 92,
	target: 68
} as any;

describe('certifiedFlow above-band steps', () => {
	it('names each row over the band, not just the largest of them', () => {
		// the split puts box 0 at 95 (92+3) where the page has it at 100: it moved up 5
		const flow = certifiedFlow(skel, 92, 1, 2, 2, [3, 18, 33, 53, 68]);
		expect(flow.aboveSteps).toEqual([{ y: 91.99, dy: -5 }]);
		expect(flow.maxAboveDy).toBe(5);
		// below-band rows keep their own steps, unchanged
		expect(flow.steps.map((s) => s.dy)).toEqual([0, 0]);
	});

	it('says nothing about a column the engine did not move above the band', () => {
		const flow = certifiedFlow(skel, 92, 1, 2, 2, [8, 23, 38, 53, 68]);
		expect(flow.aboveSteps).toEqual([{ y: 91.99, dy: 0 }]);
		expect(flow.maxAboveDy).toBe(0);
	});

	it('has nothing to say when the band holds the column first line', () => {
		expect(certifiedFlow(skel, 92, 0, 1, 2, [8, 23, 38, 53, 68]).aboveSteps).toEqual([]);
	});
});

const rec = (y: number) => ({ t: 'g', c: 65, f: 1, x: 10, y, w: 5 });
const base: Patch = {
	top: 0,
	dropTop: 110,
	dropBottom: 135,
	delta: 0,
	paraLeft: 0,
	colL: 0,
	colR: 200,
	newRecs: [],
	flowBottom: 200
};

describe('painting the region above a band', () => {
	it('leaves it alone without steps, which is every uncertified patch', () => {
		const { unchanged, raised } = splitPatchRecords([rec(100), rec(150)], [base], 300);
		expect(unchanged.map((r: any) => r.y)).toEqual([100]);
		expect(raised[0]).toEqual([]);
	});

	it('raises it by the engine own numbers once the certificate names them', () => {
		const p = { ...base, aboveSteps: [{ y: 91.99, dy: -5 }] };
		const { unchanged, raised } = splitPatchRecords([rec(100), rec(150)], [p], 300);
		// the row over the band is no longer "unchanged" -- it is the certificate's to place
		expect(unchanged).toEqual([]);
		expect(raised[0].map((r: any) => r.y)).toEqual([100]);
	});

	it('carries the font table into the lifted bucket, or it paints nothing at all', () => {
		// each bucket is handed to paintRecords as its own array and glyph ids are resolved
		// from THAT array (draftFonts.idMapFor), so a bucket without the font records resolves
		// nothing, every glyph becomes a `missing` op, and the op loop draws none of them --
		// while the records are gone from `unchanged` too. Silent, and invisible to
		// verifyPatches, which grades only the band and the rows under it.
		const font = { t: 'font', id: 1, size: 10 };
		const p = { ...base, aboveSteps: [{ y: 91.99, dy: -5 }] };
		const { unchanged, shifted, raised } = splitPatchRecords([font, rec(100), rec(150)], [p], 300);
		for (const bucket of [unchanged, shifted[0], raised[0]]) expect(bucket).toContain(font);
	});

	it('does not lift what sits above the column first galley box', () => {
		// a float pinned at the column top, and the running header: both above the first step,
		// where flowDyAt's 0 default leaves them exactly where the engine put them
		const p = { ...base, aboveSteps: [{ y: 91.99, dy: -5 }] };
		const out = recordsAfterPatch([rec(40), rec(100), rec(150)], p, 300, {})!;
		expect(out.map((r: any) => r.y)).toEqual([40, 95, 150]);
	});

	it('keeps the vertical list in order while it moves it', () => {
		// buildPageSkeleton reads records by index range, so a correctly-placed record set in
		// the wrong order is still a broken one
		const p = { ...base, aboveSteps: [{ y: 91.99, dy: -5 }], newRecs: [rec(0)] };
		const out = recordsAfterPatch([rec(100), rec(120), rec(150)], p, 300, {})!;
		expect(out.map((r: any) => r.y)).toEqual([95, 0, 150]);
	});
});
