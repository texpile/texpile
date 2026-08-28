/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from '../geometry/geometry.types';

// Rebuild a column's vertical list as a DIMENSION skeleton the engine can re-split
// (tex.splitbox = the same vert_break as the page builder), so "did this edit move the
// page break, and what is the new spacing" is the ENGINE's answer. Everything here is
// assembly, not physics: boxes from pl records (engine h/d), stretchable glue from vg
// records (engine natural width + stretch), penalties from pen records, and ONE derived
// number -- the rigid remainder of each inter-line gap (observed gap minus the effective
// stretchables; kerns fold in). The decisions are which records participate and when to
// REFUSE: footnotes/inserts, floats, graphics, or a negative rigid remainder all mean the
// skeleton would lie, and a wrong certificate is worse than no certificate -- the caller
// then keeps today's provisional path. A calibration split of the UNEDITED skeleton must
// reproduce the page's own baselines before any certificate is issued.
export type SkelItem =
	{ t: 'b'; h: number; d: number } | { t: 'g'; w: number; st: number; sto: number; sh: number; sho: number } | { t: 'p'; p: number };

export type PageSkeleton = {
	items: SkelItem[];
	// page-absolute baseline of each box item, in item order (the OLD layout)
	boxYs: number[];
	// each box's height (baseline minus its top edge), aligned with boxYs
	boxHs: number[];
	// index into items[] of each box
	boxIdx: number[];
	// content top: first box's baseline minus its height (page-absolute)
	top: number;
	// the split target that reproduces the current layout: last baseline minus top
	target: number;
};

const GAP_EPS = 0.05;

type Line = { i: number; y: number; h: number; d: number };

export function buildPageSkeleton(recs: PageRecord[], colL: number, colR: number): PageSkeleton | null {
	// candidate lines in FILE ORDER (the walker emits the vertical list in list order)
	const pls: Line[] = [];
	for (let i = 0; i < recs.length; i++) {
		const r: any = recs[i];
		if (r.t === 'pl' && r.x >= colL && r.x <= colR && r.h !== undefined) pls.push({ i, y: r.y, h: r.h, d: r.d });
	}
	if (pls.length < 2) return null;
	// drop NESTED lines (a minipage or tabular inside a line emits pl records too): a line
	// wholly inside another line's vertical span is not a galley item
	const lines = pls.filter((a) => !pls.some((b) => b !== a && a.y - a.h >= b.y - b.h - GAP_EPS && a.y + a.d <= b.y + b.d + GAP_EPS));
	if (lines.length < 2) return null;
	// A box holding PART of this column's lines (a float pinned at the top, a vmode
	// parbox): its inner lines look like galley text in the records, but the engine
	// re-places the whole box on its own terms, so re-breaking those lines would answer a
	// question TeX never asks. A box holding ALL of them is the column's own container.
	// by BASELINE, not full extent: a container box's own depth stops at its last baseline
	// while that line's descender hangs below it, which no line is ever "inside"
	for (const r of recs as any[]) {
		if (r.t !== 'vbox' || r.x < colL || r.x > colR) continue;
		const held = lines.filter((l) => l.y >= r.y - r.h - GAP_EPS && l.y <= r.y + r.d + GAP_EPS).length;
		if (held > 0 && held < lines.length) return null;
	}
	const i0 = lines[0].i,
		i1 = lines[lines.length - 1].i;
	// anything the skeleton cannot represent refuses the whole page
	for (let i = i0; i <= i1; i++) {
		const r: any = recs[i];
		if (r.t === 'note' || r.t === 'image' || r.t === 'lit') return null;
		if (r.t === 'rule') {
			// invisible rules (zero width struts, 0pt head/foot rules) paint nothing and
			// their vertical extent is already inside the observed gaps
			if (r.w <= GAP_EPS || r.h + r.d <= GAP_EPS) continue;
			// rules INSIDE a line's span are content (tabular, \hrulefill); a rule between
			// lines is structure the skeleton cannot carry (footnote rule, float rule)
			const inLine = lines.some((l) => r.y >= l.y - l.h - GAP_EPS && r.y <= l.y + l.d + GAP_EPS);
			if (!inLine) return null;
		}
	}
	const items: SkelItem[] = [];
	const boxYs: number[] = [];
	const boxHs: number[] = [];
	const boxIdx: number[] = [];
	for (let k = 0; k < lines.length; k++) {
		const ln = lines[k];
		if (k > 0) {
			const prev = lines[k - 1];
			const gap = ln.y - ln.h - (prev.y + prev.d);
			// the gap's own glue, kerns and penalties, in file order (walker order = list
			// order). The engine exports every glue now, rigid included, so this run IS the
			// column's vertical list rather than a reconstruction of it.
			let effSum = 0;
			for (let i = prev.i + 1; i < ln.i; i++) {
				const r: any = recs[i];
				if (r.t === 'pen') items.push({ t: 'p', p: r.p });
				else if (r.t === 'vk') {
					items.push({ t: 'g', w: r.w, st: 0, sto: 0, sh: 0, sho: 0 });
					effSum += r.w;
				} else if (r.t === 'vg' && r.x >= colL && r.x <= colR) {
					items.push({ t: 'g', w: r.nw ?? r.w, st: r.st || 0, sto: r.sto || 0, sh: r.sh || 0, sho: r.sho || 0 });
					effSum += r.w;
				}
			}
			// whatever the exported run does not account for. It should now be zero; anything
			// left is spacing the records cannot explain, and the model would lie about it
			const rigid = gap - effSum;
			if (rigid < -GAP_EPS) return null;
			if (rigid > GAP_EPS) items.push({ t: 'g', w: rigid, st: 0, sto: 0, sh: 0, sho: 0 });
		}
		boxIdx.push(items.length);
		boxYs.push(ln.y);
		boxHs.push(ln.h);
		items.push({ t: 'b', h: ln.h, d: ln.d });
	}
	const top = lines[0].y - lines[0].h;
	return { items, boxYs, boxHs, boxIdx, top, target: lines[lines.length - 1].y - top };
}

// Where a re-split of this column packs its top edge. The page builder puts a column's
// first baseline \topskip below the body top unless the box is taller than \topskip, so a
// column whose FIRST box changed height does not start where the old one did -- the split
// ys are measured from the packed top, and anchoring them at the old top would slide the
// whole column. Identity when the first height is unchanged (the ordinary case).
export function packedTop(skel: PageSkeleton, firstH: number, topSkip: number): number {
	if (!(topSkip > 0)) return skel.top;
	const bodyTop = skel.boxYs[0] - Math.max(topSkip, skel.boxHs[0]);
	return bodyTop + Math.max(topSkip, firstH) - firstH;
}

/** the height of a spliced item list's first box, for the landing rule */
export function firstBoxHeight(items: SkelItem[]): number {
	const b = items.find((i) => i.t === 'b');
	return b ? (b as { t: 'b'; h: number; d: number }).h : 0;
}

// Replace the boxes (and internal gaps) of [fromBox, toBox] with the edited band's own
// skeleton run built from daemon records ('line' records carry h/d; vg/pen ride along).
// Returns null when the daemon records cannot form a run the same way.
export function spliceBandSkeleton(
	skel: PageSkeleton,
	fromBox: number,
	toBox: number,
	daemonRecs: PageRecord[]
): { items: SkelItem[]; boxesBefore: number; bandBoxes: number } | null {
	const dLines: { i: number; y: number; h: number; d: number }[] = [];
	for (let i = 0; i < daemonRecs.length; i++) {
		const r: any = daemonRecs[i];
		if (r.t === 'line') dLines.push({ i, y: r.y, h: r.h ?? 0, d: r.d ?? 0 });
	}
	if (!dLines.length) return null;
	const band: SkelItem[] = [];
	for (let k = 0; k < dLines.length; k++) {
		const ln = dLines[k];
		if (k > 0) {
			const prev = dLines[k - 1];
			const gap = ln.y - ln.h - (prev.y + prev.d);
			let effSum = 0;
			for (let i = prev.i + 1; i < ln.i; i++) {
				const r: any = daemonRecs[i];
				if (r.t === 'pen') band.push({ t: 'p', p: r.p });
				else if (r.t === 'vk') {
					band.push({ t: 'g', w: r.w, st: 0, sto: 0, sh: 0, sho: 0 });
					effSum += r.w;
				} else if (r.t === 'vg') {
					band.push({ t: 'g', w: r.nw ?? r.w, st: r.st || 0, sto: r.sto || 0, sh: r.sh || 0, sho: r.sho || 0 });
					effSum += r.w;
				}
			}
			const rigid = gap - effSum;
			if (rigid < -GAP_EPS) return null;
			if (rigid > GAP_EPS) band.push({ t: 'g', w: rigid, st: 0, sto: 0, sh: 0, sho: 0 });
		}
		band.push({ t: 'b', h: ln.h, d: ln.d });
	}
	const start = skel.boxIdx[fromBox];
	const endBoxIdx = skel.boxIdx[toBox];
	const items = [...skel.items.slice(0, start), ...band, ...skel.items.slice(endBoxIdx + 1)];
	return { items, boxesBefore: fromBox, bandBoxes: dLines.length };
}
