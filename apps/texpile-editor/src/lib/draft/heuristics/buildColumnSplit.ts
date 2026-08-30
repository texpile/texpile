/* eslint-disable @typescript-eslint/no-explicit-any */
// SPLIT patch geometry: the paragraph straddles a column break. Fill column A from the
// paragraph's top to its capacity, spill the remaining lines to column B's top, shift B's
// content below by the spill-height change. The measurements the caller needs to ask whether
// anything moved at all ride back with the segments (see splitExact).
import { glyphRows } from '../geometry/glyphRows';
import type { Cal } from '../locate/locate.types';
import type { Patch } from '../patch/patch.types';

type SplitDeps = {
	h1: number;
	dk: number;
	colBottom: number;
	contentFloorOf: (p: number) => number;
	pageRecords: (n: number) => any[];
	// the daemon's \vsplit answer: the engine's break row (penalties included) instead of
	// the capacity arithmetic below
	engine?: { recsA: any[]; recsB: any[] };
	// the PAGE's own break, from the compile's source stamp. It beats both: a \vsplit has to
	// be told how much room the column has, and colBottom is the page body's floor, which is
	// not where a column ends when a float sits under it -- that mis-measure once packed
	// sixteen lines into a seven-line hole. The page already broke this paragraph here.
	at?: number;
	topSkip: number;
};

export function buildColumnSplit(
	cal: Cal & { spill: NonNullable<Cal['spill']> },
	records: any[],
	lineRecs: any[],
	d: SplitDeps
): { segA: Patch; segB: Patch; spillPage: number; kA: number; aSpan: number; spillDelta: number; bH1: number; landShift: number } {
	let kA: number;
	let recsA: any[];
	let recsB: any[];
	let yFirstB: number;
	let newSpillH: number;
	const bLines = d.engine && d.at === undefined ? d.engine.recsB.filter((x: any) => x.t === 'line') : [];
	if (d.engine && bLines.length) {
		kA = d.engine.recsA.filter((x: any) => x.t === 'line').length;
		recsA = d.engine.recsA;
		recsB = d.engine.recsB;
		yFirstB = (bLines[0] as any).y;
		newSpillH = (bLines[bLines.length - 1] as any).y - yFirstB;
	} else {
		const capA = d.at ?? Math.max(1, Math.floor((d.colBottom - (cal.b1 - d.h1)) / cal.medGap));
		kA = Math.min(lineRecs.length, capA);
		const cutY = kA >= lineRecs.length ? Infinity : ((lineRecs[kA - 1] as any).y + (lineRecs[kA] as any).y) / 2;
		recsA = records.filter((x: any) => x.t === 'font' || (x.y ?? 0) < cutY);
		recsB = records.filter((x: any) => x.t === 'font' || (x.y ?? 0) >= cutY);
		yFirstB = kA < lineRecs.length ? (lineRecs[kA] as any).y : 0;
		newSpillH = kA < lineRecs.length ? (lineRecs[lineRecs.length - 1] as any).y - yFirstB : -cal.medGap;
	}
	const segA: Patch = {
		top: cal.b1 - d.h1,
		dropTop: cal.b1 - d.h1 - 2,
		dropBottom: cal.bk + cal.medGap * 0.6,
		delta: 0,
		paraLeft: cal.paraLeft,
		colL: cal.colL,
		colR: cal.colR,
		...(cal.col === undefined ? {} : { col: cal.col }),
		newRecs: recsA
	};
	const spillOn = cal.spill.pageNo ?? cal.pageNo;
	// The receiving column seats its first baseline max(\topskip, height) below its own top,
	// so a spill whose first line is TALLER than the one it replaces starts lower -- and
	// everything under it moves with it. Measured on bert: an inline-math line arriving at the
	// head of the spill put the whole fragment 15.6pt high, which splitExact already knew to
	// call inexact while the render drew it anyway.
	//
	// The column top itself is not needed and must not be guessed: it is the same top either
	// way, so the OLD landing gives it away and the shift is the difference of the two rules.
	// That holds wherever the engine put the column -- under a float included.
	const newB0 = recsB.filter((x: any) => x.t === 'line')[0];
	const landShift =
		cal.spill.h1 === undefined || !newB0
			? 0
			: Math.max(d.topSkip, (newB0 as any).h ?? 0) - Math.max(d.topSkip, cal.spill.h1);
	const spillDelta = newSpillH - (cal.spill.bk - cal.spill.b1) + landShift;
	const segB: Patch = {
		top: cal.spill.b1 + landShift - yFirstB,
		dropTop: cal.spill.b1 - d.h1 - 2,
		dropBottom: cal.spill.bk + d.dk + 2,
		delta: spillDelta,
		paraLeft: cal.spill.paraLeft,
		colL: cal.spill.colL,
		colR: cal.spill.colR,
		newRecs: d.engine && bLines.length ? recsB : kA < lineRecs.length ? recsB : [],
		flowBottom: d.contentFloorOf(spillOn),
		flowPred: glyphRows(
			d
				.pageRecords(spillOn)
				.filter(
					(x) =>
						x.t === 'g' && x.x >= cal.spill.colL && x.x <= cal.spill.colR && x.y > cal.spill.bk + 0.5 && x.y <= d.contentFloorOf(spillOn)
				),
			cal.medGap
		)
			.slice(0, 10)
			.map((rw) => ({ y: rw.y + spillDelta, cs: rw.cs }))
	};
	const aLines = recsA.filter((x: any) => x.t === 'line');
	const newB = recsB.filter((x: any) => x.t === 'line');
	return {
		segA,
		segB,
		spillPage: spillOn,
		kA,
		aSpan: aLines.length > 1 ? aLines[aLines.length - 1].y - aLines[0].y : 0,
		spillDelta,
		bH1: newB.length ? (newB[0].h ?? 0) : 0,
		landShift
	};
}
