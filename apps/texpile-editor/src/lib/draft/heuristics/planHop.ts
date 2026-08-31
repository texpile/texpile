/* eslint-disable @typescript-eslint/no-explicit-any */
// ONE certified hop: an overflow whose carried paragraphs land at the top of the NEXT
// column (or the next page's first column) and are absorbed there. This is the disciplined
// remnant of the deleted chain, kept honest by the rules that made the certificate and the
// interior tier sound:
//
//   - every number is an engine answer: the break from the capacity split (breakMotion),
//     the junction glue from the compile's own seam capture, the landing from a splitbox
//     re-pack of [carried + seam + receiver] -- CALIBRATED first, like any certificate
//   - one hop only; a receiver that does not absorb (kB > 0) refuses
//   - a receiver carrying floats, a forced break, a missing seam, an unreadable column,
//     content moving above the band -- all refuse
//   - the render NEVER adopts and always reconciles: the pass behind it repaints anything
//     a hop cannot speak for, so a refusal costs ~0.7s and a render risks nothing lasting
//
// The chain died measuring 13.6% wrong because it assembled between engine answers across
// unbounded hops and painted anyway. Every one of those assemblies is a refusal here.
import { buildPageSkeleton, firstBoxHeight, type SkelItem } from './pageSkeleton';
import { seamAfter, seamForced, seamItems, columnIndexOf } from './seams';
import { pageColumns, type PageColumn } from '../geometry/pageColumns';
import { columnBox } from '../geometry/columnBox';
import { aboveGalley, belowGalley } from './aboveGalley';
import { relocateCarried } from './relocateCarried';
import { remapBandRecords } from '../patch/pageCertificate';
import type { BreakMotion } from '../patch/breakMotion';
import type { FlowStep } from '../patch/glueShift';
import type { Cal, PaperMetrics } from '../locate/locate.types';
import type { Patch } from '../patch/patch.types';
import type { SeamEntry } from '../patch/seam.types';
import type { SkeletonResult } from '$lib/workspace/fileSystem';

const CAL_DEV = 0.15;

export type HopDeps = {
	pageRecords: (n: number) => any[];
	splitSkeleton: (items: SkelItem[], targetPt: number, capacity?: boolean) => Promise<SkeletonResult>;
	seams: () => SeamEntry[];
	colBottomOf: (p: number) => number;
	contentFloor: (p: number) => number;
	columnFills: (page: number, col: number | undefined) => boolean;
	pageIsRtl: (p: number) => boolean;
	pageCount: () => number;
	paper: () => PaperMetrics;
	emit: (kind: string, detail?: unknown) => void;
};

export type HopPlan = { patchA: Patch; patchB: Patch; pageB: number };

export async function planHop(
	deps: HopDeps,
	cal: Cal,
	moved: BreakMotion,
	daemonRecs: any[],
	geom: { y0: number; h1: number; dk: number; floorA: number }
): Promise<HopPlan | null> {
	const refuse = (why: string, detail?: unknown): null => {
		deps.emit('hop-refused', { why, ...(detail as object) });
		return null;
	};
	// content above the band moving means the source column re-set around the edit --
	// more than a carry describes
	if (moved.maxAboveDy > 0.2) return refuse('above-moved', { dy: +moved.maxAboveDy.toFixed(2) });
	if (!moved.movedBases.length) return refuse('nothing-carried');

	// the slot in reading order: the next column of this page, else the next page's first
	const recsA = deps.pageRecords(cal.pageNo);
	const colsA = pageColumns(recsA);
	const idxA = columnIndexOf(recsA, cal.W, cal.colL);
	if (idxA < 1) return refuse('source-column');
	let pageB = cal.pageNo;
	let colB: PageColumn | undefined;
	if (idxA < colsA.length) colB = colsA[idxA];
	else {
		pageB = cal.pageNo + 1;
		if (pageB > deps.pageCount()) return refuse('no-next-page');
		colB = pageColumns(deps.pageRecords(pageB))[0];
	}
	if (!colB) return refuse('no-receiver');
	if (deps.pageIsRtl(pageB)) return refuse('receiver-rtl');
	const recsB = deps.pageRecords(pageB);
	const colBoxB = columnBox(recsB, colB.x, colB.x + colB.w);
	const colBoxA = columnBox(recsA, cal.colL, cal.colR);
	if (!colBoxB || !colBoxA) return refuse('no-column-box');

	// the junction glue the page builder discarded at the ORIGINAL A|B break reappears
	// between the carried run and B's first line -- the compile captured it per break
	const seam = seamAfter(deps.seams(), cal.pageNo, idxA, recsA, cal.W);
	if (!seam) return refuse('no-seam');
	if (seamForced(seam)) return refuse('forced-break');
	const seamIts = seamItems(seam);
	if (!seamIts) return refuse('seam-unrepresentable');

	const skelB = buildPageSkeleton(recsB, colB.x, colB.x + colB.w, (why, d) => deps.emit('hop-skel-b', { why, ...(d as object) }));
	if (!skelB || !skelB.boxYs.length) return refuse('receiver-skeleton');
	// a receiver with pinned material (a float above or below its galley) places by rules
	// a carry does not model. A float is a BOX; a glue-only run above the galley is the
	// column's own \topskip seating, which the landing replaces with the same rule.
	const bodyTopB = skelB.boxYs[0] - skelB.boxHs[0];
	const above = aboveGalley(recsB, colBoxB, bodyTopB);
	if (above && above.boxes > 0) return refuse('receiver-float-above');
	const lastB = skelB.boxYs.length - 1;
	const lastFootB = skelB.boxYs[lastB] + (skelB.items[skelB.boxIdx[lastB]] as { d: number }).d;
	const below = belowGalley(recsB, colBoxB, lastFootB);
	if (below && below.boxes > 0) return refuse('receiver-float-below');

	// calibrate the receiver UNEDITED: the skeleton must reproduce its own page or nothing
	// built on it may render (the certificate's own rule)
	const idxB = pageB === cal.pageNo ? idxA + 1 : 1;
	const fillsB = deps.columnFills(pageB, idxB - 1);
	const anchorB = skelB.top;
	const c0 = await deps.splitSkeleton(skelB.items, skelB.boxYs[lastB] - anchorB);
	if (!c0.ok || c0.kB !== 0 || c0.kA !== skelB.boxYs.length) return refuse('cal-count');
	const ys0 = fillsB ? c0.ys : (c0.nys ?? c0.ys);
	let dev = 0;
	for (let i = 0; i < ys0.length; i++) dev = Math.max(dev, Math.abs(anchorB + ys0[i] - skelB.boxYs[i]));
	if (dev > CAL_DEV) return refuse('cal-dev', { dev: +dev.toFixed(3) });

	// the landing: carried + seam + receiver, seated by \topskip, packed to the column
	const h1c = firstBoxHeight(moved.carriedItems);
	const topSkip = deps.paper().topSkip;
	const topEdgeB = colBoxB.top + Math.max(topSkip, h1c) - h1c;
	const capacity = deps.colBottomOf(pageB) - topEdgeB;
	const carriedBoxes = moved.movedBases.length;
	const cf = await deps.splitSkeleton([...moved.carriedItems, ...seamIts, ...skelB.items], capacity, true);
	if (!cf.ok) return refuse('land-split');
	if (cf.kB !== 0) return refuse('receiver-overflows', { kB: cf.kB }); // needs a second hop
	if (cf.kA !== carriedBoxes + skelB.boxYs.length) return refuse('land-count', { kA: cf.kA });
	const ysB = fillsB ? cf.ys : (cf.nys ?? cf.ys);
	if (ysB.length !== cf.kA) return refuse('land-ys');

	const newBases = moved.movedBases.map((_, j) => topEdgeB + ysB[j]);
	const stepsB: FlowStep[] = [];
	for (let j = 0; j < skelB.boxYs.length; j++)
		stepsB.push({ y: skelB.boxYs[j] - skelB.boxHs[j] - 0.01, dy: topEdgeB + ysB[carriedBoxes + j] - skelB.boxYs[j] });

	const bandRecs = remapBandRecords(daemonRecs, moved.bandAbsYs, cal.b1 - geom.y0);
	if (!bandRecs) return refuse('band-remap');
	const carried = relocateCarried(
		recsA,
		moved.movedBases,
		newBases,
		{ yTop: moved.clipY, yBottom: deps.colBottomOf(cal.pageNo) + geom.dk + 2, colL: cal.colL, colR: cal.colR },
		colBoxB.x - colBoxA.x
	);
	if (!carried.length) return refuse('nothing-relocated');

	const patchA: Patch = {
		top: cal.b1 - geom.y0,
		dropTop: cal.b1 - Math.max(geom.h1, geom.y0) - 2,
		dropBottom: cal.bk + geom.dk + 2,
		delta: 0,
		paraLeft: cal.paraLeft,
		colL: cal.colL,
		colR: cal.colR,
		newRecs: bandRecs,
		flowBottom: geom.floorA,
		flowSteps: moved.staySteps,
		clipBottom: moved.clipY
	};
	// pure shift + landed records: an empty drop window just above the receiver's galley
	const patchB: Patch = {
		top: 0,
		dropTop: bodyTopB - 1,
		dropBottom: bodyTopB - 1,
		delta: 0,
		paraLeft: 0,
		colL: colBoxB.x,
		colR: colBoxB.x + colBoxB.w,
		newRecs: carried,
		flowBottom: deps.contentFloor(pageB),
		flowSteps: stepsB
	};
	return { patchA, patchB, pageB };
}
