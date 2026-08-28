/* eslint-disable @typescript-eslint/no-explicit-any */
import { nextSlot, type OverflowContext } from './nextSlot';
import type { BreakMotion } from '../patch/breakMotion';
import type { Cal } from '../locate/locate.types';
import type { PageRecord } from '../geometry/geometry.types';
import type { Patch } from '../patch/patch.types';

export type MotionPlan = { segA: Patch; segB: Patch; samePage: boolean; spillPage: number; carried: number };

// Render an ENGINE-detected moved break: the edit's column keeps the band on certified
// baselines and respaces what stays by the engine's own repack; the carried rows (named
// by the capacity split, not by slack arithmetic) re-draw at the top of the next slot in
// reading order, pushing its content down. The seam gap at the slot top is a medGap
// guess -- the spacing at a break is material the old layout discarded -- so the caller
// always marks both pages provisional and reconciles.
export function planBreakMotion(
	ctx: OverflowContext,
	cal: Cal,
	bandRecs: PageRecord[],
	motion: BreakMotion,
	g: { y0: number; h1: number; dk: number; floorA: number }
): MotionPlan | null {
	// the render leaves above-band content where it was; when the engine's repack moves
	// that region visibly, this composition would lie about the seam above the band
	if (motion.maxAboveDy > 2) return null;
	const slot = nextSlot(ctx, cal, g.h1);
	if (!slot) return null;
	const carried = ctx
		.pageRecords(cal.pageNo)
		.filter(
			(x: any) =>
				x.t === 'font' ||
				((x.t === 'g' || x.t === 'rule' || x.t === 'image' || x.t === 'lit') &&
					x.x >= cal.colL &&
					x.x <= cal.colR &&
					(x.y ?? 0) > motion.clipY &&
					(x.y ?? 0) <= g.floorA)
		);
	if (!carried.some((x: any) => x.y !== undefined)) return null;
	const segA: Patch = {
		top: cal.b1 - g.y0,
		dropTop: cal.b1 - Math.max(g.h1, g.y0) - 2,
		dropBottom: cal.bk + g.dk + 2,
		delta: 0,
		paraLeft: cal.paraLeft,
		colL: cal.colL,
		colR: cal.colR,
		newRecs: bandRecs,
		flowSteps: motion.staySteps.length ? motion.staySteps : undefined,
		// identity clip: delta is 0, so the carried rows drop by their OLD position --
		// exactly the rows the engine named, not whatever crossed a pixel threshold
		clipBottom: motion.clipY,
		flowBottom: g.floorA
	};
	const segB: Patch = {
		// the first carried baseline takes the slot's own body-top baseline (the
		// topskip-governed spot its previous first line occupied), so the slot's content
		// moves down by the carried BASELINE span plus one seam gap -- baseline pitch,
		// not box extent, or a one-line carry pushes almost two lines
		top: slot.topB - motion.movedBases[0],
		dropTop: slot.topB - g.h1 - 2,
		dropBottom: slot.topB - g.h1 - 2,
		delta: motion.movedBases[motion.movedBases.length - 1] - motion.movedBases[0] + cal.medGap,
		paraLeft: slot.movedDx,
		colL: slot.colLB,
		colR: slot.colRB,
		newRecs: carried,
		flowBottom: ctx.contentFloor(slot.spillPage)
	};
	return { segA, segB, samePage: slot.samePage, spillPage: slot.spillPage, carried: motion.movedBases.length };
}
