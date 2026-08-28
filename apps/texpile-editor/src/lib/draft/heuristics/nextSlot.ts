/* eslint-disable @typescript-eslint/naming-convention -- TeX geometry shorthand: col L/R edges on page B */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { columnCandidates } from './columnCandidates';
import { COL_GUTTER } from './tolerances';
import { glyphRows } from '../geometry/glyphRows';
import type { Cal } from '../locate/locate.types';
import type { PageRecord } from '../geometry/geometry.types';

export type OverflowContext = {
	pageRecords(n: number): PageRecord[];
	contentFloor(page: number): number;
	pageCount(): number;
	colSep?: number;
};

export type NextSlot = {
	samePage: boolean;
	spillPage: number;
	// the slot's text left, its match window, and its body-top baseline
	colTx: number;
	colLB: number;
	colRB: number;
	topB: number;
	// x displacement for rows that keep page-absolute coordinates when they change column
	movedDx: number;
};

// The next slot in reading order: TeX fills columns left to right before breaking the
// page, so a non-final column overflows into the NEXT COLUMN of the SAME page. The
// next column's origin is ARITHMETIC -- this column's text left + the engine's
// \columnwidth + \columnsep -- never elected from glyph clusters: nested cluster
// candidates (an indented abstract) are fine for MATCH windows, which lose harmlessly,
// but as a slot they painted the spill back inside this same column, over the title.
// Content past the next origin proves a real column there; else route to the next page.
// null: the spill would leave the document (no next page exists).
export function nextSlot(ctx: OverflowContext, cal: Cal, h1: number): NextSlot | null {
	const pageA = ctx.pageRecords(cal.pageNo);
	const myTx = cal.colL + COL_GUTTER;
	const gA = pageA.filter((x: any) => x.t === 'g');
	const nextTx = myTx + cal.W + (ctx.colSep && ctx.colSep > 0 ? ctx.colSep : 10);
	const maxRight = gA.length ? Math.max(...gA.map((x: any) => x.x as number)) : 0;
	const nextCol = maxRight > nextTx + 1 ? nextTx : null;
	const samePage = nextCol !== null;
	const pB = samePage ? cal.pageNo : cal.pageNo + 1;
	if (!samePage && pB > ctx.pageCount()) return null;
	// target slot geometry: body top under any isolated running-header row
	const gB = samePage ? gA : ctx.pageRecords(pB).filter((x: any) => x.t === 'g');
	const colTx = samePage ? nextCol! : gB.length ? (columnCandidates(gB, cal.W, COL_GUTTER, ctx.colSep)[0] ?? myTx) : myTx;
	const colLB = colTx - COL_GUTTER;
	const colRB = colTx + cal.W + COL_GUTTER;
	function rowsIn(lo: number, hi: number) {
		let rows = gB.length
			? glyphRows(
					gB.filter((x: any) => x.x >= lo && x.x <= hi),
					cal.medGap
				)
			: [];
		while (rows.length >= 2 && rows[1].y - rows[0].y > cal.medGap * 2.2) rows = rows.slice(1);
		return rows;
	}
	// the slot's body top: the highest paragraph line the ENGINE broke at this column's
	// width inside the slot window (pl records) -- full-width material (a title block
	// spanning both columns) carries w = \textwidth and drops out, where the glyph-row
	// scan mistook it for the column top. Row scan stays as the older-bridge fallback.
	const recsB = samePage ? pageA : ctx.pageRecords(pB);
	const plB = (recsB as any[]).filter((x) => x.t === 'pl' && Math.abs(x.w - cal.W) <= 2 && x.x >= colLB && x.x <= colRB);
	const rowsB = rowsIn(colLB, colRB);
	// an empty next column still starts at the page's text top: mirror this column's
	const topB = plB.length
		? Math.min(...plB.map((x: any) => x.y as number))
		: rowsB.length
			? rowsB[0].y
			: samePage
				? (rowsIn(cal.colL, cal.colR)[0]?.y ?? h1 + cal.medGap)
				: h1 + cal.medGap;
	// moved rows carry page-absolute x: offset by the measured column displacement, and
	// snap sub-tolerance offsets to 0 so same-column targets keep their exact x
	const movedDx = Math.abs(colTx - myTx) <= COL_GUTTER ? 0 : colTx - myTx;
	return { samePage, spillPage: pB, colTx, colLB, colRB, topB, movedDx };
}
