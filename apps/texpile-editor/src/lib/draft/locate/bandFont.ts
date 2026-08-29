/* eslint-disable @typescript-eslint/no-explicit-any */
import { dominant } from '../geometry/dominant';
import { fontSizePrefix } from '../heuristics/fontSizePrefix';
import { median } from '../geometry/median';
import type { PageRecord } from '../geometry/geometry.types';
import type { SourceLine } from './sourceFragments';

// The band's OWN font, read off the glyphs the engine put on these very lines. The source tier
// already knows which lines the paragraph made, so unlike the search tiers there is nothing to
// cluster and nothing to try: a footnote, an abstract or a quote states its size and leading
// outright. Empty when the band runs at the page's dominant size, because the daemon already
// typesets there and an identical prefix would only buy a second typeset of the same text.
export function bandFontPrefix(recs: PageRecord[], lines: SourceLine[]): string {
	const sizeOf = new Map<number, number>();
	for (const r of recs as any[]) if (r.t === 'font') sizeOf.set(r.id, r.size);
	if (!sizeOf.size) return '';
	const page = new Map<number, number>();
	const band = new Map<number, number>();
	for (const g of recs as any[]) {
		if (g.t !== 'g') continue;
		const s = sizeOf.get(g.f);
		if (s === undefined) continue;
		page.set(s, (page.get(s) || 0) + 1);
		// baseline AND x within the line box: grid-aligned columns share baselines, so y alone
		// tallies the neighbouring column's font too
		if (lines.some((l) => Math.abs(g.y - l.y) <= 0.2 && g.x >= l.x - 1 && g.x <= l.x + l.w + 1)) band.set(s, (band.get(s) || 0) + 1);
	}
	const size = dominant(band);
	if (!(size > 0) || Math.abs(size - dominant(page)) <= 0.05) return '';
	const ys = lines.map((l) => l.y).sort((a, b) => a - b);
	const deltas: number[] = [];
	for (let i = 1; i < ys.length; i++) {
		const d = ys[i] - ys[i - 1];
		if (d > 1 && d < size * 2.5) deltas.push(d);
	}
	return fontSizePrefix(size, median(deltas) || size * 1.2);
}
