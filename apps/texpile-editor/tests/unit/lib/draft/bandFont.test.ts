import { describe, expect, it } from 'vitest';
import { bandFontPrefix } from '$lib/draft/locate/bandFont';
import type { PageRecord } from '$lib/draft/geometry/geometry.types';

// The decision under test: does the band run at the page's own size, or at one of its own.
// Getting this wrong costs a daemon typeset that breaks to the wrong number of lines, which
// is what sent every abstract and footnote edit down the slow search path.
const font = (id: number, size: number) => ({ t: 'font', id, size });
const g = (f: number, y: number, x: number) => ({ t: 'g', f, y, x, c: 65 });
const line = (y: number, x = 62) => ({ x, y, w: 345, h: 8 });

function page(bandSize: number): PageRecord[] {
	const recs: Record<string, unknown>[] = [font(1, 10), font(2, bandSize)];
	// 40 body glyphs on lines the band does not claim, 12 on the two lines it does
	for (let i = 0; i < 40; i++) recs.push(g(1, 200 + i, 70));
	for (const y of [500, 512]) for (let i = 0; i < 6; i++) recs.push(g(2, y, 70 + i));
	return recs as unknown as PageRecord[];
}

describe('bandFontPrefix', () => {
	it('says nothing when the band is set in the page’s dominant size', () => {
		// the daemon already typesets there, and a prefix would only buy a second typeset of
		// text it has already broken
		expect(bandFontPrefix(page(10), [line(500), line(512)])).toBe('');
	});

	it('states the band’s own size and its measured leading', () => {
		const pre = bandFontPrefix(page(9), [line(500), line(512)]);
		expect(pre).toContain('9.0000pt');
		// leading from the band's OWN baselines, not the body's
		expect(pre).toContain('{12.0000pt}');
	});

	it('ignores a neighbouring column sharing the band’s baselines', () => {
		// grid-aligned columns put another paragraph's glyphs on the same y; only x separates
		// enough of them to outvote the band's own 12 glyphs, but not the page's 52
		const recs = [...(page(10) as unknown as Record<string, unknown>[])];
		for (const y of [500, 512]) for (let i = 0; i < 20; i++) recs.push(g(3, y, 500 + i));
		recs.push(font(3, 7));
		expect(bandFontPrefix(recs as unknown as PageRecord[], [line(500), line(512)])).toBe('');
	});
});
