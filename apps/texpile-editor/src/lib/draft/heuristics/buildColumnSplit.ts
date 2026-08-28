/* eslint-disable @typescript-eslint/no-explicit-any */
// SPLIT patch geometry: the paragraph straddles a column break. Fill column A from the
// paragraph's top to its capacity, spill the remaining lines to column B's top, shift B's
// content below by the spill-height change. Always provisional.
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
};

export function buildColumnSplit(
	cal: Cal & { spill: NonNullable<Cal['spill']> },
	records: any[],
	lineRecs: any[],
	d: SplitDeps
): { segA: Patch; segB: Patch; spillPage: number; kA: number } {
	let kA: number;
	let recsA: any[];
	let recsB: any[];
	let yFirstB: number;
	let newSpillH: number;
	const bLines = d.engine ? d.engine.recsB.filter((x: any) => x.t === 'line') : [];
	if (d.engine && bLines.length) {
		kA = d.engine.recsA.filter((x: any) => x.t === 'line').length;
		recsA = d.engine.recsA;
		recsB = d.engine.recsB;
		yFirstB = (bLines[0] as any).y;
		newSpillH = (bLines[bLines.length - 1] as any).y - yFirstB;
	} else {
		const capA = Math.max(1, Math.floor((d.colBottom - (cal.b1 - d.h1)) / cal.medGap));
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
	const spillDelta = newSpillH - (cal.spill.bk - cal.spill.b1);
	const segB: Patch = {
		top: cal.spill.b1 - yFirstB,
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
	return { segA, segB, spillPage: spillOn, kA };
}
