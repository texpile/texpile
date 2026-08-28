/* eslint-disable @typescript-eslint/naming-convention -- TeX geometry shorthand: col L/R edges on page B */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { columnWindows, type ColumnWindow } from './columnWindows';
import { COL_GUTTER } from './tolerances';
import { glyphRows } from '../geometry/glyphRows';
import { pageColumns } from '../geometry/pageColumns';
import type { Cal } from '../locate/locate.types';
import type { PageRecord } from '../geometry/geometry.types';

export type OverflowContext = {
	pageRecords(n: number): PageRecord[];
	contentFloor(page: number): number;
	pageCount(): number;
	colSep?: number;
};

// the geometry a slot election actually needs; Cal satisfies it, and the chain planner
// synthesizes one per hop as the flow moves through columns the locate never visited
export type SlotFrom = Pick<Cal, 'pageNo' | 'colL' | 'colR' | 'W' | 'medGap'>;

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
// page, so a non-final column overflows into the NEXT COLUMN of the SAME page.
//
// The next column comes from the page's own column boxes. It used to be ARITHMETIC --
// this column's text left + \columnwidth + \columnsep, with "some glyph sits past it"
// standing in for proof that a column was there -- because a glyph cluster could not be
// trusted to name a slot: nested candidates (an indented abstract) lose harmlessly as
// MATCH windows but as a slot painted the spill back inside this same column, over the
// title. The engine either names the next column or there is not one.
//
// null: the spill would leave the document (no next page exists).
export function nextSlot(ctx: OverflowContext, cal: SlotFrom, h1: number): NextSlot | null {
	const pageA = ctx.pageRecords(cal.pageNo);
	const gA = pageA.filter((x: any) => x.t === 'g');
	const colsA = columnWindows(pageA, gA, cal.W, COL_GUTTER, ctx.colSep);
	const fromEngine = pageColumns(pageA).some((c) => Math.abs(c.w - cal.W) <= 2);
	// identify this column by its WINDOW, and take its text left from the column itself.
	// Reconstructing the text left as colL + gutter assumes the window carries a full pad,
	// which stopped being true when the pad started narrowing to keep adjacent windows
	// apart: on a 10pt \columnsep that reconstruction sits 3pt right of the real origin,
	// and movedDx carried the error into every row it displaced.
	const mine = colsA.findIndex((c) => Math.abs(c.colL - cal.colL) <= 1);
	const myTx = mine >= 0 ? colsA[mine].x : cal.colL + COL_GUTTER;
	let next: ColumnWindow | null;
	if (fromEngine && mine >= 0) {
		next = mine + 1 < colsA.length ? colsA[mine + 1] : null;
	} else {
		// no recorded columns of this width (multicol, a float page, a full-width band, an
		// older bridge): the arithmetic origin and its glyph-past-it proof stand in
		const nextTx = myTx + cal.W + (ctx.colSep && ctx.colSep > 0 ? ctx.colSep : 10);
		const maxRight = gA.length ? Math.max(...gA.map((x: any) => x.x as number)) : 0;
		next = maxRight > nextTx + 1 ? { x: nextTx, colL: nextTx - COL_GUTTER, colR: nextTx + cal.W + COL_GUTTER } : null;
	}
	const samePage = next !== null;
	const pB = samePage ? cal.pageNo : cal.pageNo + 1;
	if (!samePage && pB > ctx.pageCount()) return null;
	// target slot geometry: body top under any isolated running-header row
	const recsB = samePage ? pageA : ctx.pageRecords(pB);
	const gB = samePage ? gA : recsB.filter((x: any) => x.t === 'g');
	const slot = samePage
		? next!
		: gB.length
			? (columnWindows(recsB, gB, cal.W, COL_GUTTER, ctx.colSep)[0] ?? { x: myTx, colL: cal.colL, colR: cal.colR })
			: { x: myTx, colL: cal.colL, colR: cal.colR };
	const colTx = slot.x;
	const colLB = slot.colL;
	const colRB = slot.colR;
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
