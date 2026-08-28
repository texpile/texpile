/* eslint-disable @typescript-eslint/no-explicit-any */
// The single-band reflow arithmetic behind an instant patch: how much the paragraph grew or
// shrank (delta), how much room the column has (slack), and the resulting patch object.
import { glyphRows } from '../geometry/glyphRows';
import { FLOW_GAP, UNDERFLOW_FRACTION } from './tolerances';
import { flowShiftSteps, flowDyAt, type FlowStep } from '../patch/glueShift';
import type { Cal } from '../locate/locate.types';
import type { Patch } from '../patch/patch.types';

export function lineExtents(lineRecs: any[]): { h1: number; dk: number } {
	return { h1: (lineRecs[0] as any).h ?? 7, dk: (lineRecs[lineRecs.length - 1] as any).d ?? 2 };
}

export type Reflow = {
	y0: number;
	delta: number;
	slack: number;
	overflow: boolean;
	underflow: boolean;
	belowBases: number[];
	lastBelow: number;
};

export function computeReflow(
	cal: Cal,
	records: any[],
	lineRecs: any[],
	d: { dk: number; colBottom: number; floorA: number; pageRecords: (n: number) => any[] }
): Reflow {
	// the band (cal.b1..bk) is measured in GLYPH-ROW baselines, so the daemon side must
	// be too: a tabular is ONE line record spanning the whole table (its baseline the
	// [c]-alignment center), and line-shape math placed it ~half a table off and read a
	// phantom under/overflow. Glyph rows are identical to line records for prose.
	const dRowsNew = glyphRows(
		records.filter((x: any) => x.t === 'g'),
		cal.medGap
	);
	const y0 = dRowsNew.length ? dRowsNew[0].y : ((lineRecs[0] as any).y ?? 0);
	const yk = dRowsNew.length ? dRowsNew[dRowsNew.length - 1].y : ((lineRecs[lineRecs.length - 1] as any).y ?? 0);
	const delta = yk - y0 - (cal.bk - cal.b1);
	// C3: the column/page break must not move. A delta<=0 edit (same or fewer lines)
	// can't push content past the column bottom, so it's always safe on the overflow
	// side. When it GROWS, the content below the paragraph in this column shifts down
	// by delta and must still clear the column bottom: slack = column bottom - the
	// lowest content currently below the paragraph. (Measuring against the whole
	// column's last line was wrong -- on a full page that's ~0 even for a delta-0
	// edit near the top.)
	// slack = room below the paragraph before the column overflows. colBottom is the
	// shipped box bottom (~ the footer line). lastBelow is the lowest baseline that is
	// part of the CONTIGUOUS text flow under the paragraph -- walk down line by line and
	// stop at the big gap before an isolated footer/page-number, which sits in the bottom
	// margin and isn't content the paragraph could push off the page.
	const belowBases = [
		...new Set(
			d
				.pageRecords(cal.pageNo)
				.filter((x) => x.t === 'g' && x.x >= cal.colL && x.x <= cal.colR && x.y > cal.bk + 0.5 && x.y <= d.floorA)
				.map((x) => +x.y.toFixed(1))
		)
	].sort((a, b) => a - b);
	let lastBelow = cal.bk;
	for (const y of belowBases) {
		if (y - lastBelow > cal.medGap * FLOW_GAP) break; // jumped to the footer/header
		lastBelow = y;
	}
	const slack = d.colBottom - (lastBelow + d.dk);
	const overflow = delta > 0 && delta > slack + 1;
	const underflow = delta < -UNDERFLOW_FRACTION * cal.medGap;
	return { y0, delta, slack, overflow, underflow, belowBases, lastBelow };
}

// records anchor by glyph row (first daemon row baseline lands on b1); the wipe keeps
// the line-shape extent too -- for a tabular that over-wipes into float glue, which
// beats leaving the old table's ink outside a row-based band
export function buildBandPatch(
	cal: Cal,
	records: any[],
	d: {
		y0: number;
		h1: number;
		dk: number;
		delta: number;
		floorA: number;
		stretchy?: boolean;
		pageRecords: (n: number) => any[];
		// engine page-break certificate: the caller pre-mapped the band records onto the
		// certified baselines; the column follows the certified steps with NO rigid delta
		cert?: { steps: FlowStep[] };
	}
): Patch {
	// on a stretched (flushbottom) page the delta distributes over the column's real glue
	// -- TeX's vpack arithmetic -- instead of shifting the flow rigidly off the grid.
	// With a certificate the steps ARE the engine's own repack; nothing is derived.
	const steps: FlowStep[] | null = d.cert
		? d.cert.steps
		: d.stretchy
			? flowShiftSteps(d.pageRecords(cal.pageNo), cal.bk, d.floorA, cal.colL, cal.colR, d.delta)
			: null;
	const flowDelta = d.cert ? 0 : d.delta;
	return {
		top: cal.b1 - d.y0,
		dropTop: cal.b1 - Math.max(d.h1, d.y0) - 2,
		dropBottom: cal.bk + d.dk + 2,
		delta: flowDelta,
		paraLeft: cal.paraLeft,
		colL: cal.colL,
		colR: cal.colR,
		...(cal.col === undefined ? {} : { col: cal.col }),
		newRecs: records,
		flowBottom: d.floorA,
		flowSteps: steps ?? undefined,
		flowPred: glyphRows(
			d.pageRecords(cal.pageNo).filter((x) => x.t === 'g' && x.x >= cal.colL && x.x <= cal.colR && x.y > cal.bk + 0.5 && x.y <= d.floorA),
			cal.medGap
		)
			.slice(0, 10)
			.map((rw) => ({ y: rw.y + flowDyAt(steps, rw.y, flowDelta), cs: rw.cs }))
	};
}
