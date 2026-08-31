import { describe, expect, it } from 'vitest';
import { aboveGalley, belowGalley, topSkipGlue } from '$lib/draft/heuristics/aboveGalley';
import { pageColumns } from '$lib/draft/geometry/pageColumns';

// The paper fixture, page 3, left column: a table float pinned at the top, its separation
// stretched 12 -> 22.78 and 20 -> 30.78 to help fill the column. Records are the walker's
// own emission -- the float's internals (its rules, its caption's glue) arrive between the
// vbox marker and the top-level run that follows it, which is what the cursor has to tell
// apart. The column packs 53.00 -> 603.00; the galley's first baseline is 219.09.
const FLOAT_COL = [
	{ t: 'col', x: 0, y: 603, h: 550, d: 0, w: 229.5, gord: 0 },
	{ t: 'vbox', x: 0, y: 178.31, h: 125.31, d: 0, w: 229.5 },
	{ t: 'vbox', x: 0, y: 178.31, h: 125.31, d: 0, w: 229.5 },
	{ t: 'vg', x: 0, y: 151.79, w: 0, nw: 0 },
	{ t: 'rule', x: 0, y: 160.19, h: 8.4, d: 3.6, w: 0 },
	{ t: 'vg', x: 0, y: 163.79, w: 0, nw: 0 },
	{ t: 'rule', x: 0, y: 172.19, h: 8.4, d: 3.6, w: 0 },
	{ t: 'vg', x: 0, y: 175.79, w: 1.72, nw: 1.72 },
	{ t: 'rule', x: 0, y: 178.31, h: 0.8, d: 0, w: 183.02 },
	{ t: 'vg', x: 0, y: 178.31, w: 0, nw: 0 },
	{ t: 'vg', x: 0, y: 178.31, w: 0, nw: 0 },
	{ t: 'vg', x: 0, y: 178.31, w: 22.78, nw: 12, st: 2, sto: 0, sh: 2, sho: 0 },
	{ t: 'vg', x: 0, y: 201.09, w: -22.78, nw: -12, st: -2, sto: 0, sh: -2, sho: 0 },
	{ t: 'vg', x: 0, y: 178.31, w: 30.78, nw: 20, st: 2, sto: 0, sh: 4, sho: 0 },
	{ t: 'vg', x: 0, y: 209.09, w: 2.95, nw: 2.95 },
	{ t: 'pl', x: 0, y: 219.09, h: 7.05, d: 1.94, w: 229.5, c: 9 },
	{ t: 'colend' }
];

const col = (recs: unknown[]) => pageColumns(recs as never)[0];
const natural = (items: { t: string; h?: number; d?: number; w?: number }[]) =>
	items.reduce((a, i) => a + (i.t === 'b' ? i.h! + i.d! : i.t === 'g' ? i.w! : 0), 0);

// body top = first galley baseline - its height - whatever \topskip leaves
const BODY_TOP = 219.09 - 7.05 - (10 - 7.05);

describe('aboveGalley', () => {
	it('reads the float and its separation, and nothing nested inside them', () => {
		const a = aboveGalley(FLOAT_COL as never, col(FLOAT_COL), BODY_TOP)!;
		expect(a.top).toBe(53);
		expect(a.boxes).toBe(1);
		// the float box and the five top-level glues under it; the caption's glue, the
		// table's rules and the duplicate inner vbox are all inside the float
		expect(a.items.length).toBe(6);
		// unset: 156.09pt of column filled by 145.31pt of natural material plus its stretch,
		// which is the whole point -- the engine gets it back when a carried run arrives
		expect(natural(a.items)).toBeCloseTo(145.31, 2);
	});

	it('refuses a run that does not reach the body top', () => {
		// drop the second separation: the remaining items no longer span the observed gap
		const torn = FLOAT_COL.filter((r) => r.nw !== 20);
		expect(aboveGalley(torn as never, col(torn), BODY_TOP)).toBeNull();
	});

	it('reads a galley starting at the column top as an empty run', () => {
		const plain = [
			{ t: 'col', x: 0, y: 603, h: 550, d: 0, w: 229.5, gord: 0 },
			{ t: 'vg', x: 0, y: 53, w: 3.06, nw: 3.06 },
			{ t: 'pl', x: 0, y: 63, h: 6.94, d: 2.06, w: 229.5, c: 5 },
			{ t: 'colend' }
		];
		const a = aboveGalley(plain as never, col(plain), 53)!;
		expect(a.items).toEqual([]);
		expect(a.top).toBe(53);
	});

	it('does not swallow the column as its own float', () => {
		// a one-column page reaches its column straight down the page's vertical list, so the
		// walker emits the container vbox alongside the col record. Consuming it would make
		// the whole column one 550pt prelude box.
		const one = [
			{ t: 'col', x: 62, y: 603, h: 550, d: 0, w: 345, gord: 0 },
			{ t: 'vbox', x: 62, y: 603, h: 550, d: 0, w: 345 },
			{ t: 'vg', x: 62, y: 53, w: 3.06, nw: 3.06 },
			{ t: 'pl', x: 62, y: 63, h: 6.94, d: 2.06, w: 345, c: 1 },
			{ t: 'colend' }
		];
		expect(aboveGalley(one as never, col(one), 53)!.items).toEqual([]);
	});

	it('ignores a neighbouring column entirely', () => {
		const two = [
			{ t: 'col', x: 240, y: 603, h: 550, d: 0, w: 229.5, gord: 0 },
			{ t: 'vg', x: 240, y: 53, w: 99, nw: 99 },
			{ t: 'colend' },
			...FLOAT_COL
		];
		expect(aboveGalley(two as never, col(two), BODY_TOP)!.items.length).toBe(6);
	});
});

// The same fixture's right column ends its galley at 573.18 with a table pinned under it:
// separation, the float's rules and caption, down to the column bottom at 603.
const BOTTOM_FLOAT = [
	{ t: 'col', x: 240, y: 603, h: 550, d: 0, w: 229.5, gord: 0 },
	{ t: 'pl', x: 240, y: 573.18, h: 7.05, d: 2.06, w: 229.5, c: 9 },
	{ t: 'vg', x: 240, y: 575.24, w: 9.76, nw: 8, st: 2, sto: 0, sh: 4, sho: 0 },
	{ t: 'vbox', x: 240, y: 603, h: 18, d: 0, w: 229.5 },
	{ t: 'rule', x: 240, y: 585.4, h: 0.4, d: 0, w: 183 },
	{ t: 'colend' }
];

describe('belowGalley', () => {
	it('reads what is pinned under the galley, so its room is not the text to spend', () => {
		const b = belowGalley(BOTTOM_FLOAT as never, col(BOTTOM_FLOAT), 575.24)!;
		expect(b.boxes).toBe(1);
		// the separation and the float; the float's own rule is inside it
		expect(b.items.length).toBe(2);
		expect(b.natural).toBeCloseTo(26, 2);
	});

	it('refuses a run that does not reach the column bottom', () => {
		const short = BOTTOM_FLOAT.filter((r) => r.t !== 'vbox');
		expect(belowGalley(short as never, col(short), 575.24)).toBeNull();
	});

	it('reads a galley that runs to the column bottom as an empty run', () => {
		const full = [
			{ t: 'col', x: 0, y: 603, h: 550, d: 0, w: 229.5, gord: 0 },
			{ t: 'pl', x: 0, y: 601, h: 7.05, d: 2, w: 229.5, c: 1 },
			{ t: 'colend' }
		];
		expect(belowGalley(full as never, col(full), 603)!.items).toEqual([]);
	});
});

const glueWidth = (topSkip: number, h: number) => (topSkipGlue(topSkip, h) as { w: number }).w;

describe('topSkipGlue', () => {
	it('leaves what the arriving height does not use', () => {
		expect(glueWidth(10, 7.05)).toBeCloseTo(2.95, 4);
	});

	it('vanishes under a box taller than \\topskip', () => {
		expect(glueWidth(10, 12)).toBe(0);
	});
});
