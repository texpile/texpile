import { describe, expect, it } from 'vitest';
import { sourceBand } from '$lib/draft/locate/sourceBand';
import { memoizeTypesets } from '$lib/draft/locate/memoizeTypesets';
import type { LocateContext } from '$lib/draft/locate/locate.types';

// The decisions under test: which page lines a source range owns, and the three shapes the
// stamp cannot resolve on its own (a straddle across pages, a straddle across columns, and a
// file the compile never stamped).
type Rec = Record<string, unknown>;
const pl = (y: number, s?: number, sf = 1, x = 62): Rec => ({ t: 'pl', x, y, w: 345, h: 8, d: 2, ...(s === undefined ? {} : { s, sf }) });

function ctxOf(pages: Record<number, Rec[]>): LocateContext {
	return {
		pageNumbers: () => Object.keys(pages).map(Number),
		pageRecords: (n: number) => pages[n] ?? []
	} as unknown as LocateContext;
}

const FILES = ['main.tex', 'chapter1.tex'];

describe('sourceBand', () => {
	it('takes the lines the compile attributed to the range, in reading order', () => {
		const ctx = ctxOf({ 1: [pl(100, 12), pl(88, 12), pl(140, 20), pl(76)] });
		const r = sourceBand(ctx, FILES, 'C:/proj/main.tex', 12, 12);
		expect('bail' in r).toBe(false);
		if ('bail' in r) return;
		expect(r.pageNo).toBe(1);
		expect(r.lines.map((l) => l.y)).toEqual([88, 100]);
	});

	it('matches the file by basename, and refuses one the compile never stamped', () => {
		const ctx = ctxOf({ 1: [pl(88, 12, 2)] });
		// chapter1.tex is id 2, so a records-carry-sf lookup must resolve through the table
		expect('bail' in sourceBand(ctx, FILES, 'C:/proj/parts/chapter1.tex', 12, 12)).toBe(false);
		// a stamped line belonging to another file is not this paragraph
		expect(sourceBand(ctx, FILES, 'C:/proj/main.tex', 12, 12)).toMatchObject({ bail: 'no-source-records' });
		expect(sourceBand(ctx, FILES, 'C:/proj/other.tex', 12, 12)).toMatchObject({ bail: 'file-not-stamped' });
	});

	it('refuses a straddle rather than serving half of it', () => {
		// across pages, and across columns of one page: both are the cross-page tier's job,
		// and it needs the split point, which the union of the lines does not carry
		expect(sourceBand(ctxOf({ 1: [pl(600, 12)], 2: [pl(80, 12)] }), FILES, 'main.tex', 12, 12)).toMatchObject({ bail: 'spans-pages' });
		expect(sourceBand(ctxOf({ 1: [pl(600, 12), pl(80, 12, 1, 300)] }), FILES, 'main.tex', 12, 12)).toMatchObject({
			bail: 'spans-columns'
		});
	});

	it('an untagged line belongs to no range (a caption claims nothing)', () => {
		expect(sourceBand(ctxOf({ 1: [pl(88), pl(100)] }), FILES, 'main.tex', 1, 999)).toMatchObject({ bail: 'no-source-records' });
	});
});

describe('memoizeTypesets', () => {
	it('asks the daemon once per text and width, however many tiers want it', async () => {
		let calls = 0;
		const base = { typesetParagraph: async () => ({ ok: true, n: ++calls }) } as unknown as LocateContext;
		const ctx = memoizeTypesets(base);
		const a = await ctx.typesetParagraph({ text: 'p', hsize: 345 });
		const b = await ctx.typesetParagraph({ text: 'p', hsize: 345 });
		expect(calls).toBe(1);
		expect(b).toBe(a);
		// a different width is a different question
		await ctx.typesetParagraph({ text: 'p', hsize: 229 });
		expect(calls).toBe(2);
	});
});
