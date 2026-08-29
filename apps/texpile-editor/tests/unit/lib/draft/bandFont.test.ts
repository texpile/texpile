import { describe, expect, it } from 'vitest';
import { bandFontPrefix } from '$lib/draft/locate/bandFont';
import type { PageRecord } from '$lib/draft/geometry/geometry.types';

// The decision under test: which glyphs count as the band's own. Reading the font off the
// wrong ones asks the daemon for a box that breaks to a different number of lines, which is
// what sent every abstract and footnote edit down the slow search path.
const font = (id: number, size: number) => ({ t: 'font', id, size });
const g = (f: number, y: number, x: number) => ({ t: 'g', f, y, x, c: 65 });
const line = (y: number, x = 62) => ({ x, y, w: 345, h: 8 });

function page(bandSize: number): Record<string, unknown>[] {
	const recs: Record<string, unknown>[] = [font(1, 10), font(2, bandSize)];
	// 40 body glyphs on lines the band does not claim, 12 on the two lines it does
	for (let i = 0; i < 40; i++) recs.push(g(1, 200 + i, 70));
	for (const y of [500, 512]) for (let i = 0; i < 6; i++) recs.push(g(2, y, 70 + i));
	return recs;
}
const asRecs = (r: Record<string, unknown>[]) => r as unknown as PageRecord[];

describe('bandFontPrefix', () => {
	it('states the band’s own size and the leading its baselines carry', () => {
		const pre = bandFontPrefix(asRecs(page(9)), [line(500), line(512)]);
		expect(pre).toContain('9.0000pt');
		// leading from the band's OWN baselines, not the body's
		expect(pre).toContain('{12.0000pt}');
	});

	it('falls back to a proportional leading when one line has none to measure', () => {
		expect(bandFontPrefix(asRecs(page(9)), [line(500)])).toContain('{10.8000pt}');
	});

	it('ignores a neighbouring column sharing the band’s baselines', () => {
		// grid-aligned columns put another paragraph's glyphs on the same y; only x separates
		const recs = page(9);
		for (const y of [500, 512]) for (let i = 0; i < 20; i++) recs.push(g(3, y, 500 + i));
		recs.push(font(3, 7));
		expect(bandFontPrefix(asRecs(recs), [line(500), line(512)])).toContain('9.0000pt');
	});

	it('says nothing when the compile recorded no fonts', () => {
		expect(bandFontPrefix(asRecs([g(1, 500, 70)]), [line(500)])).toBe('');
	});
});
