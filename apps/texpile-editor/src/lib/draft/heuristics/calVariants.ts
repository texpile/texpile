/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention -- TeX geometry shorthand: W = width */
import { dominant } from '../geometry/dominant';
import { fontSizePrefix } from './fontSizePrefix';
import { median } from '../geometry/median';
import type { PageRecord } from '../geometry/geometry.types';

// Calibration variants BEYOND the announced \columnwidth/\textwidth: widths the page itself
// declares. A narrowed environment (an ACL abstract: parshape'd 0.6cm margins AND a 10pt font
// under an 11pt body) reproduces at no announced width, so its edits never patched. Every
// number here is engine-read -- the width from pl records (each paragraph line's \hsize at
// break time), the font size from the band's own font records, the leading from the lines'
// baseline deltas -- the only DECISION is which clusters are worth the extra daemon typesets.
export type CalVariant = { W: number; pre: string };

// fewer lines looks like stray boxed material, not an environment worth a variant
const MIN_LINES = 3;
// a cluster this close (pt) to an announced width adds nothing over the base variants
const WIDTH_TOL = 2;
// each variant costs daemon typesets on every locate; the abstract case needs one
const MAX_VARIANTS = 2;

export function extraCalVariants(paper: { colW: number; textW: number }, recs: PageRecord[]): CalVariant[] {
	const pls = (recs as any[]).filter((r) => r.t === 'pl');
	if (pls.length < MIN_LINES) return [];
	const fontSize = new Map<number, number>();
	for (const r of recs as any[]) if (r.t === 'font') fontSize.set(r.id, r.size);
	// dominant size on the page = what the daemon already typesets in; only a DIFFERENT
	// size needs a \fontsize prefix
	const sizeCount = new Map<number, number>();
	for (const g of recs as any[])
		if (g.t === 'g') {
			const s = fontSize.get(g.f);
			if (s !== undefined) sizeCount.set(s, (sizeCount.get(s) || 0) + 1);
		}
	const bodySize = dominant(sizeCount);
	const sorted = [...pls].sort((a, b) => a.w - b.w);
	const clusters: any[][] = [];
	for (const p of sorted) {
		const c = clusters[clusters.length - 1];
		if (c && p.w - c[c.length - 1].w <= 0.5) c.push(p);
		else clusters.push([p]);
	}
	const out: { W: number; pre: string; count: number }[] = [];
	for (const c of clusters) {
		if (c.length < MIN_LINES) continue;
		const W = median(c.map((p) => p.w));
		if (W <= 20 || Math.abs(W - paper.colW) <= WIDTH_TOL || Math.abs(W - paper.textW) <= WIDTH_TOL) continue;
		// the cluster's own font: glyphs sitting ON these lines (baseline AND x within the
		// line box -- grid-aligned columns share baselines, so y alone tallies the neighbour
		// column's font too)
		const tally = new Map<number, number>();
		for (const p of c)
			for (const g of recs as any[])
				if (g.t === 'g' && Math.abs(g.y - p.y) <= 0.2 && g.x >= p.x - 1 && g.x <= p.x + p.w + 1) {
					const s = fontSize.get(g.f);
					if (s !== undefined) tally.set(s, (tally.get(s) || 0) + 1);
				}
		const size = dominant(tally);
		let pre = '';
		if (size > 0 && Math.abs(size - bodySize) > 0.05) {
			const ys = c.map((p) => p.y).sort((a, b) => a - b);
			const deltas: number[] = [];
			for (let i = 1; i < ys.length; i++) {
				const d = ys[i] - ys[i - 1];
				if (d > 1 && d < size * 2.5) deltas.push(d);
			}
			pre = fontSizePrefix(size, median(deltas) || size * 1.2);
		}
		out.push({ W, pre, count: c.length });
	}
	out.sort((a, b) => b.count - a.count);
	return out.slice(0, MAX_VARIANTS).map(({ W, pre }) => ({ W, pre }));
}
