/* eslint-disable @typescript-eslint/no-explicit-any */
import { nextSlot, type OverflowContext } from './nextSlot';
import type { PageRecord } from '../geometry/geometry.types';
import type { Cal } from '../locate/locate.types';
import type { Patch } from '../patch/patch.types';

export type OverflowGeometry = {
	h1: number;
	dk: number;
	delta: number;
	colBottom: number;
	belowBases: number[];
	lastBelow: number;
	// the daemon's \vsplit answer (recsA = what fit, recsB = the remainder): the ENGINE's
	// break row, penalties included. Absent (older daemon, split refused): the line
	// arithmetic below stands in.
	engine?: { recsA: PageRecord[]; recsB: PageRecord[] };
};

export type OverflowPlan = {
	segA: Patch;
	segsB: Patch[];
	samePage: boolean;
	spillPage: number;
	kA: number;
	lineCount: number;
	movedCount: number;
};

// The truthful overflow split: the edit's column keeps the band replace + shift with
// everything past the column bottom CLIPPED; those rows re-draw at the top of the next
// slot in READING ORDER -- the next column of this page when the edit's column is not
// the last one, else the next page's first column -- as insert segments (para tail at
// the slot's text left, moved page rows offset by the measured column displacement),
// pushing the slot's content down. First-order break estimate -> caller always marks
// provisional and reconciles.
export function planOverflowSplit(
	ctx: OverflowContext,
	cal: Cal,
	recs: PageRecord[],
	lineRecs: PageRecord[],
	g: OverflowGeometry
): OverflowPlan | null {
	const { h1, dk, delta, colBottom } = g;
	const topA = cal.b1 - h1;
	let kA: number;
	let recsA: PageRecord[];
	let tailRecs: PageRecord[];
	let yFirstTail: number; // first tail line's baseline in its own box coords
	let tailSpan = 0; // first tail line top -> last tail baseline + depth
	const bLines = g.engine ? (g.engine.recsB.filter((x: any) => x.t === 'line') as any[]) : [];
	if (g.engine && bLines.length) {
		kA = g.engine.recsA.filter((x: any) => x.t === 'line').length;
		recsA = g.engine.recsA;
		tailRecs = g.engine.recsB;
		yFirstTail = bLines[0].y;
		tailSpan = bLines[bLines.length - 1].y + (bLines[bLines.length - 1].d ?? 2) - (yFirstTail - (bLines[0].h ?? h1));
	} else {
		// para lines whose patched position crosses the column bottom
		kA = lineRecs.length;
		while (kA > 1 && topA + lineRecs[kA - 1].y + (lineRecs[kA - 1].d ?? 2) > colBottom + 1) kA--;
		const cutY = kA < lineRecs.length ? (lineRecs[kA - 1].y + lineRecs[kA].y) / 2 : Infinity;
		recsA = recs.filter((x) => x.t === 'font' || (x.y ?? 0) < cutY);
		tailRecs = kA < lineRecs.length ? recs.filter((x) => x.t === 'font' || (x.y ?? 0) >= cutY) : [];
		yFirstTail = kA < lineRecs.length ? lineRecs[kA].y : 0;
		if (tailRecs.length) tailSpan = lineRecs[lineRecs.length - 1].y + dk - (yFirstTail - h1);
	}
	// existing content-flow rows the shift pushes past the bottom (belowBases already
	// excludes the bottom-anchored footer via the content floor)
	const floorA = ctx.contentFloor(cal.pageNo);
	const movedFrom = g.belowBases.filter((y) => y + delta + dk > colBottom + 1);
	const movedMinY = movedFrom.length ? Math.min(...movedFrom) : Infinity;
	const pageA = ctx.pageRecords(cal.pageNo);
	const movedRecs = movedFrom.length
		? pageA.filter(
				(x: any) =>
					x.t === 'font' ||
					((x.t === 'g' || x.t === 'rule' || x.t === 'image' || x.t === 'lit') &&
						x.x >= cal.colL &&
						x.x <= cal.colR &&
						(x.y ?? 0) >= movedMinY - 0.5 &&
						(x.y ?? 0) <= floorA)
			)
		: [];
	if (!tailRecs.length && !movedRecs.length) return null;
	// slot election and geometry live in nextSlot (shared with the engine motion planner)
	const slot = nextSlot(ctx, cal, h1);
	if (!slot) return null;
	const { samePage, spillPage: pB, colTx, colLB, colRB, topB, movedDx } = slot;
	const tailH = tailRecs.length ? tailSpan : 0;
	const movedH = movedRecs.length ? Math.max(...movedFrom) + dk - (movedMinY - h1) : 0;
	const push = (tailH ? tailH + cal.medGap : 0) + (movedH ? movedH + cal.medGap : 0);
	const segA: Patch = {
		top: topA,
		dropTop: topA - 2,
		dropBottom: cal.bk + dk + 2,
		delta,
		paraLeft: cal.paraLeft,
		colL: cal.colL,
		colR: cal.colR,
		newRecs: recsA,
		// EXACTLY the negation of the moved-rows predicate (y + delta + dk > colBottom + 1),
		// or the boundary row draws on both pages
		clipBottom: colBottom + 1 - dk,
		flowBottom: floorA
	};
	const segsB: Patch[] = [];
	let curTop = topB;
	if (tailRecs.length) {
		segsB.push({
			top: curTop - yFirstTail,
			dropTop: topB - h1 - 2,
			dropBottom: topB - h1 - 2,
			delta: push,
			paraLeft: colTx,
			colL: colLB,
			colR: colRB,
			newRecs: tailRecs
		});
		curTop += tailH + cal.medGap;
	}
	if (movedRecs.length)
		segsB.push({
			top: curTop + h1 - movedMinY,
			dropTop: topB - h1 - 2,
			dropBottom: topB - h1 - 2,
			delta: segsB.length ? 0 : push,
			paraLeft: movedDx,
			colL: colLB,
			colR: colRB,
			newRecs: movedRecs
		});
	return { segA, segsB, samePage, spillPage: pB, kA, lineCount: lineRecs.length, movedCount: movedFrom.length };
}
