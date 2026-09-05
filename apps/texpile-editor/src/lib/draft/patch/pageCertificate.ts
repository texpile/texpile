/* eslint-disable @typescript-eslint/no-explicit-any */
import {
	buildPageSkeleton,
	spliceBandSkeleton,
	packedTop,
	firstBoxHeight,
	type PageSkeleton,
	type SkelItem
} from '../heuristics/pageSkeleton';
import { breakMotion, type BreakMotion } from './breakMotion';
import { certifiedFlow } from './certifiedFlow';
import { columnFills } from '../heuristics/columnFills';
import { belowGalley } from '../heuristics/aboveGalley';
import { columnBox } from '../geometry/columnBox';
import { columnIndexOf } from '../heuristics/seams';
import type { Cal } from '../locate/locate.types';
import type { FlowStep } from './glueShift';
import type { PageRecord } from '../geometry/geometry.types';
import type { SkeletonItem, SkeletonResult } from '$lib/workspace/fileSystem';

// The engine page-break certificate. Two splitbox runs on the warm daemon: first the
// UNEDITED column skeleton, which must reproduce the page's own baselines (calibration --
// if it can't, the skeleton is missing something and no certificate is issued); then the
// skeleton with the edited band spliced in.
//
// Two grades, by what the split target can honestly mean:
// - SAME line count: nothing about the page's packing changes, so the split at the old
//   content extent reproduces the layout -- full certificate, ys included. This is what
//   upgrades a stretch-approx band to exact.
// - GROWN band: the page may absorb the growth into stretch/shrink or spare room below
//   its current extent, so the layout target is unknowable from one sub-range -- but the
//   FIT question is not: split at the page's capacity (content top to the body bottom).
//   kB=0 -> the engine says it fits; kB>0 -> the engine says the break moves, whatever the
//   JS slack arithmetic thought. Where the column's last baseline already sits ON the body
//   bottom there is no room below to be unknowable ABOUT, so capacity and layout target are
//   one number and that split's baselines are the layout too -- a full certificate.
export type Certificate = {
	// the engine's answer to "does the edited content still fit this page"
	fits: boolean;
	// full certificate only (same line count): certified page-absolute baselines for the
	// band lines, respace steps for the rest of the column, and the largest displacement
	// ABOVE the band, which the render applies from aboveSteps (maxAboveDy is informational)
	bandAbsYs?: number[];
	steps?: FlowStep[];
	// the engine's respace for the rows OVER the band, which the render now applies instead
	// of reducing to maxAboveDy and wearing a tint for
	aboveSteps?: FlowStep[];
	maxAboveDy?: number;
	// break moved: the capacity split's answer for WHERE -- certified baselines for what
	// stays and the identity of the carried boxes, so the chain planner can render the
	// motion. Absent when the break lands inside the band.
	moved?: BreakMotion;
	// band LOST lines: the freed room may pull next-slot material up, a question only the
	// engine can answer -- the pull planner splits this seed against the next column
	shrunk?: ShrinkSeed;
};

export type ShrinkSeed = {
	skel: PageSkeleton;
	items: SkelItem[];
	// the packed top a re-split of this column lands on (the landing rule, in case the
	// band carried the column's first line)
	top: number;
	fromBox: number;
	toBox: number;
	bandBoxes: number;
	boxesAfter: number;
};

// what a fits certificate with baselines actually guarantees (Required<Certificate>
// would falsely promise `moved`, which never accompanies fits:true)
export type FullCertificate = Certificate & Required<Pick<Certificate, 'bandAbsYs' | 'steps' | 'aboveSteps' | 'maxAboveDy'>>;

const CAL_DEV = 0.15;
// the column's last baseline sits on the body bottom: full, with nothing below to grow into
const PINNED_EPS = 0.5;

export async function pageBreakCertificate(
	deps: {
		pageRecords: (n: number) => PageRecord[];
		splitSkeleton: (items: SkeletonItem[], targetPt: number, capacity?: boolean) => Promise<SkeletonResult>;
		emit: (kind: string, detail?: unknown) => void;
	},
	cal: Cal,
	daemonRecs: PageRecord[],
	colBottom: number,
	topSkip: number
): Promise<Certificate | null> {
	function refuse(why: string, detail?: unknown): null {
		deps.emit('skel-refused', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return null;
	}
	const recsA = deps.pageRecords(cal.pageNo);
	const skel = buildPageSkeleton(recsA, cal.colL, cal.colR, (why, d) => refuse('build:' + why, d));
	if (!skel) return null;
	// which reading of the split IS this column's layout. The chain planner has always made
	// this distinction per hop; the certificate did not, so on a column the engine left short
	// -- the document's LAST page above all -- it measured the page's own baselines against a
	// stretched reading and reported content above the band as having moved.
	const ciA = columnIndexOf(recsA, cal.W, cal.colL);
	const fillsA = columnFills(recsA, ciA > 0 ? ciA - 1 : undefined);
	// Room this galley does NOT have: a float pinned at the column's foot. The capacity split
	// asks whether the edited content still fits, and measuring to the body bottom credits the
	// text with the float's room -- so it answers "fits" on a column that overflows, and a
	// fits answer suppresses the spill render outright (see bandCanSpill). \@colroom is
	// reduced by the float at its NATURAL size, before any of it stretches.
	const lastK = skel.boxYs.length - 1;
	const colA = columnBox(recsA, cal.colL, cal.colR);
	const belowA = colA ? belowGalley(recsA, colA, skel.boxYs[lastK] + (skel.items[skel.boxIdx[lastK]] as { d: number }).d) : null;
	// A float is a BOX; a trailing run of glue is the column's own slack, which the galley may
	// legitimately grow into -- subtracting that refused certificates on columns with nothing
	// pinned at all. Unread is not absent either: a foot that will not model keeps the old
	// reading rather than inventing a reduction for it.
	const pinned = belowA && belowA.boxes > 0 ? belowA.natural : 0;
	let fromBox = -1,
		toBox = -1;
	for (let k = 0; k < skel.boxYs.length; k++)
		if (skel.boxYs[k] >= cal.b1 - 0.5 && skel.boxYs[k] <= cal.bk + 0.5) {
			if (fromBox < 0) fromBox = k;
			toBox = k;
		}
	if (fromBox < 0) return refuse('band-boxes');
	const c0 = await deps.splitSkeleton(skel.items, skel.target);
	if (!c0.ok) return refuse('cal-split', { error: c0.error });
	if (c0.kB !== 0 || c0.kA !== skel.boxYs.length) return refuse('cal-count', { kA: c0.kA, kB: c0.kB, boxes: skel.boxYs.length });
	let calDev = 0;
	for (let k = 0; k < skel.boxYs.length; k++) calDev = Math.max(calDev, Math.abs(skel.top + c0.ys[k] - skel.boxYs[k]));
	if (calDev > CAL_DEV) return refuse('cal-dev', { dev: +calDev.toFixed(3) });
	const spliced = spliceBandSkeleton(skel, fromBox, toBox, daemonRecs);
	if (!spliced) return refuse('splice');
	const boxesAfter = skel.boxYs.length - (toBox - fromBox + 1) + spliced.bandBoxes;
	// an edit to the column's FIRST line moves the packed top: the split's ys are measured
	// from there, so every baseline below would slide if they were anchored at the old top
	const top = fromBox === 0 ? packedTop(skel, firstBoxHeight(spliced.items), topSkip) : skel.top;
	// a band that LOST lines frees room the page builder may fill by pulling next-slot
	// material up -- items this skeleton cannot see. The pull planner asks the engine.
	if (spliced.bandBoxes < toBox - fromBox + 1) {
		deps.emit('skel-shrunk', { boxes: boxesAfter });
		return { fits: true, shrunk: { skel, items: spliced.items, top, fromBox, toBox, bandBoxes: spliced.bandBoxes, boxesAfter } };
	}
	const sameCount = spliced.bandBoxes === toBox - fromBox + 1;
	const capacity = colBottom - top - pinned;
	// the layout target is measured from the packed top to the column's own last baseline,
	// which the page bottom pins: identical to skel.target unless the top moved
	const layoutTarget = skel.boxYs[skel.boxYs.length - 1] - top;
	if (!sameCount) {
		// grown band: fit test at the page's CAPACITY (top to body bottom) -- the page can
		// absorb growth into stretch/shrink or the spare room under its current extent,
		// which the old content extent cannot express
		const cf = await deps.splitSkeleton(spliced.items, capacity, true);
		if (!cf.ok) return refuse('fit-split', { error: cf.error });
		const fits = cf.kB === 0 && cf.kA === boxesAfter;
		// A column whose last baseline already sits ON the body bottom has no spare room under
		// its extent to absorb the growth into, so the target the layout is unknowable from --
		// how far down the column may grow -- is pinned to the capacity the fit test just split
		// at. That split IS the engine's layout for the grown column, and returning only its
		// yes/no left the render to the JS overflow arithmetic, which moved a band the engine
		// had just said stays put.
		const ysFit = fillsA ? cf.ys : (cf.nys ?? cf.ys);
		if (fits && Math.abs(capacity - layoutTarget) <= PINNED_EPS && ysFit?.length === cf.kA) {
			const flow = certifiedFlow(skel, top, fromBox, toBox, spliced.bandBoxes, ysFit);
			deps.emit('skel-certified', {
				page: cal.pageNo,
				boxes: boxesAfter,
				calDev: +calDev.toFixed(3),
				maxAboveDy: +flow.maxAboveDy.toFixed(3),
				grown: true
			});
			return { fits: true, ...flow };
		}
		const moved = fits ? null : breakMotion(skel, top, spliced.bandBoxes, fromBox, toBox, cf, boxesAfter, fillsA);
		deps.emit(fits ? 'skel-fits' : 'skel-break-moved', {
			kA: cf.kA,
			kB: cf.kB,
			boxes: boxesAfter,
			capacity: +capacity.toFixed(1),
			motion: !!moved
		});
		return { fits, moved: moved ?? undefined };
	}
	const c1 = await deps.splitSkeleton(spliced.items, layoutTarget);
	if (!c1.ok) return refuse('edit-split', { error: c1.error });
	if (c1.kB !== 0 || c1.kA !== boxesAfter) {
		// not an error: the engine says the break MOVED. One more split at CAPACITY says
		// where it falls -- kB=0 there means the extent merely grew inside the page's
		// spare room, and there is no motion to render
		const cs = await deps.splitSkeleton(spliced.items, capacity, true);
		const moved = cs.ok && cs.kB > 0 ? breakMotion(skel, top, spliced.bandBoxes, fromBox, toBox, cs, boxesAfter, fillsA) : null;
		deps.emit('skel-break-moved', { kA: c1.kA, kB: c1.kB, boxes: boxesAfter, motion: !!moved });
		return { fits: false, moved: moved ?? undefined };
	}
	// which reading is this column's layout -- the same question the grown branch asks at the
	// fit split. Missing here, the SAME-COUNT edit (typing inside a line, the commonest edit
	// there is) read a column the engine left short as though its glue had been stretched to
	// the goal, and adopted those baselines into the record store.
	const ys1 = fillsA ? c1.ys : (c1.nys ?? c1.ys);
	if (ys1.length !== c1.kA) return refuse('no-natural-ys');
	const flow = certifiedFlow(skel, top, fromBox, toBox, spliced.bandBoxes, ys1);
	deps.emit('skel-certified', {
		page: cal.pageNo,
		boxes: boxesAfter,
		calDev: +calDev.toFixed(3),
		maxAboveDy: +flow.maxAboveDy.toFixed(3),
		fills: fillsA
	});
	return { fits: true, ...flow };
}

// bake the certified baselines into the daemon records: every record moves with its
// nearest daemon line, so the renderer's ordinary (y + patch.top) placement lands each
// band line on the engine's number. null when lines and certificate disagree in count.
export function remapBandRecords(daemonRecs: PageRecord[], bandAbsYs: number[], top: number): PageRecord[] | null {
	const dLines = (daemonRecs as any[]).filter((r) => r.t === 'line');
	if (dLines.length !== bandAbsYs.length) return null;
	const dys = dLines.map((ln, j) => bandAbsYs[j] - (top + ln.y));
	return (daemonRecs as any[]).map((r) => {
		if (r.y === undefined || r.t === 'font') return r;
		let best = 0,
			bd = Infinity;
		for (let j = 0; j < dLines.length; j++) {
			const dd = Math.abs(r.y - dLines[j].y);
			if (dd < bd) {
				bd = dd;
				best = j;
			}
		}
		return { ...r, y: r.y + dys[best] };
	});
}
