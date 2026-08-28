/* eslint-disable @typescript-eslint/no-explicit-any */
import { buildPageSkeleton, spliceBandSkeleton } from '../heuristics/pageSkeleton';
import { breakMotion, type BreakMotion } from './breakMotion';
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
//   kB=0 -> the engine says it fits (fit-only certificate: keep the flow-steps render);
//   kB>0 -> the engine says the break moves, whatever the JS slack arithmetic thought.
export type Certificate = {
	// the engine's answer to "does the edited content still fit this page"
	fits: boolean;
	// full certificate only (same line count): certified page-absolute baselines for the
	// band lines, respace steps for the rest of the column, and the largest displacement
	// ABOVE the band (the renderer never moves that region; visible value -> provisional)
	bandAbsYs?: number[];
	steps?: FlowStep[];
	maxAboveDy?: number;
	// break moved: the capacity split's answer for WHERE -- certified baselines for what
	// stays and the identity of the carried boxes, so the caller can render the motion
	// (always provisional). Absent when the break lands inside the band.
	moved?: BreakMotion;
};

// what a fits certificate with baselines actually guarantees (Required<Certificate>
// would falsely promise `moved`, which never accompanies fits:true)
export type FullCertificate = Certificate & Required<Pick<Certificate, 'bandAbsYs' | 'steps' | 'maxAboveDy'>>;

const CAL_DEV = 0.15;

export async function pageBreakCertificate(
	deps: {
		pageRecords: (n: number) => PageRecord[];
		splitSkeleton: (items: SkeletonItem[], targetPt: number, capacity?: boolean) => Promise<SkeletonResult>;
		emit: (kind: string, detail?: unknown) => void;
	},
	cal: Cal,
	daemonRecs: PageRecord[],
	colBottom: number
): Promise<Certificate | null> {
	function refuse(why: string, detail?: unknown): null {
		deps.emit('skel-refused', { why, ...(typeof detail === 'object' ? detail : { detail }) });
		return null;
	}
	const skel = buildPageSkeleton(deps.pageRecords(cal.pageNo), cal.colL, cal.colR);
	if (!skel) return refuse('build');
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
	// a band that LOST lines frees room the page builder may fill by pulling next-page
	// material up -- items this skeleton cannot see. Growth and same-count edits only.
	if (spliced.bandBoxes < toBox - fromBox + 1) return refuse('fewer-lines');
	const boxesAfter = skel.boxYs.length - (toBox - fromBox + 1) + spliced.bandBoxes;
	const sameCount = spliced.bandBoxes === toBox - fromBox + 1;
	const capacity = colBottom - skel.top;
	if (!sameCount) {
		// grown band: fit test at the page's CAPACITY (top to body bottom) -- the page can
		// absorb growth into stretch/shrink or the spare room under its current extent,
		// which the old content extent cannot express
		const cf = await deps.splitSkeleton(spliced.items, capacity, true);
		if (!cf.ok) return refuse('fit-split', { error: cf.error });
		const fits = cf.kB === 0 && cf.kA === boxesAfter;
		const moved = fits ? null : breakMotion(skel, spliced.bandBoxes, fromBox, toBox, cf, boxesAfter);
		deps.emit(fits ? 'skel-fits' : 'skel-break-moved', {
			kA: cf.kA,
			kB: cf.kB,
			boxes: boxesAfter,
			capacity: +capacity.toFixed(1),
			motion: !!moved
		});
		return { fits, moved: moved ?? undefined };
	}
	const c1 = await deps.splitSkeleton(spliced.items, skel.target);
	if (!c1.ok) return refuse('edit-split', { error: c1.error });
	if (c1.kB !== 0 || c1.kA !== boxesAfter) {
		// not an error: the engine says the break MOVED. One more split at CAPACITY says
		// where it falls -- kB=0 there means the extent merely grew inside the page's
		// spare room, and there is no motion to render
		const cs = await deps.splitSkeleton(spliced.items, capacity, true);
		const moved = cs.ok && cs.kB > 0 ? breakMotion(skel, spliced.bandBoxes, fromBox, toBox, cs, boxesAfter) : null;
		deps.emit('skel-break-moved', { kA: c1.kA, kB: c1.kB, boxes: boxesAfter, motion: !!moved });
		return { fits: false, moved: moved ?? undefined };
	}
	const bandAbsYs: number[] = [];
	for (let j = 0; j < spliced.bandBoxes; j++) bandAbsYs.push(skel.top + c1.ys[fromBox + j]);
	const steps: FlowStep[] = [];
	let maxAboveDy = 0;
	for (let k = 0; k < skel.boxYs.length; k++) {
		if (k >= fromBox && k <= toBox) continue;
		const kNew = k < fromBox ? k : k - (toBox - fromBox + 1) + spliced.bandBoxes;
		const dy = skel.top + c1.ys[kNew] - skel.boxYs[k];
		if (k < fromBox) maxAboveDy = Math.max(maxAboveDy, Math.abs(dy));
		// threshold at the box TOP so the whole line moves together
		else steps.push({ y: skel.boxYs[k] - skel.boxHs[k] - 0.01, dy });
	}
	deps.emit('skel-certified', {
		page: cal.pageNo,
		boxes: boxesAfter,
		calDev: +calDev.toFixed(3),
		maxAboveDy: +maxAboveDy.toFixed(3)
	});
	return { fits: true, bandAbsYs, steps, maxAboveDy };
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
