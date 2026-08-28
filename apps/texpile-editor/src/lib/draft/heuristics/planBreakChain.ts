/* eslint-disable @typescript-eslint/no-explicit-any */
import { nextSlot, type OverflowContext, type SlotFrom } from './nextSlot';
import { buildPageSkeleton, type PageSkeleton, type SkelItem } from './pageSkeleton';
import { carriedRecords, remapCarried } from './carryRecords';
import { seamAfter, seamForced, seamItems, seamHeight, columnIndexOf } from './seams';
import type { BreakMotion } from '../patch/breakMotion';
import type { Cal } from '../locate/locate.types';
import type { PageRecord } from '../geometry/geometry.types';
import type { Patch } from '../patch/patch.types';
import type { SeamEntry } from '../patch/seam.types';
import type { SkeletonItem, SkeletonResult } from '$lib/workspace/fileSystem';

export type ChainDeps = {
	splitSkeleton: (items: SkeletonItem[], targetPt: number, capacity?: boolean) => Promise<SkeletonResult>;
	seams: () => SeamEntry[];
	colBottomOf: (p: number) => number;
	/** the engine fills this page's columns to their goal: only there does a capacity
	 *  split's packing match the engine's own (see columnFills) */
	columnFills: (page: number, col: number | undefined) => boolean;
	/** a right-to-left page takes the raster and ignores patches: flowing onto one would
	 *  clip rows off this page with nothing drawn in their place */
	pageIsRtl: (p: number) => boolean;
	emit: (kind: string, detail?: unknown) => void;
};

export type ChainPlan = {
	// segments grouped by page, edit page first, in flow order
	pages: { page: number; segs: Patch[] }[];
	// rows carried out of the edit column, and receiving columns painted
	carried: number;
	hops: number;
	// every junction had seam data, every hop calibrated, and the engine confirmed the
	// final column absorbs without pulling more -- the render needs no tint
	exact: boolean;
	endPage: number;
	samePage: boolean;
};

const CAL_DEV = 0.15;
const MAX_HOPS = 4;

// the rolling flow state between hops: what leaves a column, in that column's own frame
type Carried = {
	recs: PageRecord[];
	oldBases: number[];
	items: SkelItem[];
	from: SlotFrom;
	srcCol: number;
	seam: SeamEntry | null;
};

function boxDim(items: SkelItem[], idx: number): { h: number; d: number } {
	return items[idx] as { t: 'b'; h: number; d: number };
}

// today's first-order landing: carried rows keep their source-page coordinates and the
// slot's content shifts down rigidly -- used whenever a hop cannot be certified
function legacySeg(
	slot: { topB: number; movedDx: number; colLB: number; colRB: number; spillPage: number },
	c: Carried,
	gap: number,
	floor: number
): Patch {
	const hFirst = boxDim(c.items, 0).h;
	return {
		top: slot.topB - c.oldBases[0],
		dropTop: slot.topB - hFirst - 2,
		dropBottom: slot.topB - hFirst - 2,
		delta: c.oldBases[c.oldBases.length - 1] - c.oldBases[0] + gap,
		paraLeft: slot.movedDx,
		colL: slot.colLB,
		colR: slot.colRB,
		newRecs: c.recs,
		flowBottom: floor
	};
}

// The chained flow: each hop asks the ENGINE what the receiving column does with the
// carried block on top -- calibrate the column's own skeleton first, then capacity-split
// [carried + captured seam + column]. kB=0 ends the chain (with a pull probe confirming
// the break really stays); kB>0 names the next carried set and the flow continues. Any
// hop that cannot be certified renders one first-order segment and stops, tinted.
export async function planBreakChain(
	deps: ChainDeps,
	ctx: OverflowContext,
	cal: Cal,
	bandRecs: PageRecord[],
	motion: BreakMotion,
	g: { y0: number; h1: number; dk: number; floorA: number },
	topSkip: number
): Promise<ChainPlan | null> {
	// the render leaves above-band content where it was; when the engine's repack moves
	// that region visibly, this composition would lie about the seam above the band
	if (motion.maxAboveDy > 2) return null;
	const pageA = ctx.pageRecords(cal.pageNo);
	const seams = deps.seams();
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
	const srcCol0 = columnIndexOf(pageA, cal.W, cal.colL);
	let carried: Carried = {
		recs: carriedRecords(pageA, cal.colL, cal.colR, motion.clipY, g.floorA),
		oldBases: motion.movedBases,
		items: motion.carriedItems,
		from: { pageNo: cal.pageNo, colL: cal.colL, colR: cal.colR, W: cal.W, medGap: cal.medGap },
		srcCol: srcCol0,
		seam: srcCol0 > 0 ? seamAfter(seams, cal.pageNo, srcCol0, pageA, cal.W) : null
	};
	if (!carried.recs.some((x: any) => x.y !== undefined)) return null;
	// crossing a forced break (\newpage) moves whole columns wholesale -- the full pass
	// renders that honestly, a first-order composition does not
	if (carried.seam && seamForced(carried.seam)) {
		deps.emit('chain-forced', { page: cal.pageNo, col: srcCol0 });
		return null;
	}
	const pages: ChainPlan['pages'] = [{ page: cal.pageNo, segs: [segA] }];
	let hops = 0;
	let exact = motion.maxAboveDy <= 0.2;
	let endPage = cal.pageNo;
	let samePage = true;

	function addSeg(page: number, seg: Patch): void {
		const entry = pages.find((p) => p.page === page);
		if (entry) entry.segs.push(seg);
		else pages.push({ page, segs: [seg] });
	}
	function finish(reason: string): ChainPlan {
		deps.emit('chain-end', { hops, exact, reason, endPage });
		return { pages, carried: motion.movedBases.length, hops, exact, endPage, samePage };
	}

	while (hops < MAX_HOPS) {
		const hFirst = boxDim(carried.items, 0).h;
		const slot = nextSlot(ctx, carried.from, hFirst);
		// an RTL target is as good as no slot: it paints no patch ink at all
		if (!slot || deps.pageIsRtl(slot.spillPage)) {
			// the flow would leave the document: an unrendered first hop keeps today's cram
			// path; a later hop just leaves its rows to the reconcile
			if (hops === 0) return null;
			exact = false;
			return finish(slot ? 'rtl-slot' : 'no-slot');
		}
		hops++;
		endPage = slot.spillPage;
		samePage = samePage && slot.samePage;
		const floorB = ctx.contentFloor(slot.spillPage);
		const seamIts = carried.seam && !seamForced(carried.seam) ? seamItems(carried.seam) : null;
		const recsB = ctx.pageRecords(slot.spillPage);
		const skelB = seamIts && topSkip > 0 ? buildPageSkeleton(recsB, slot.colLB, slot.colRB) : null;
		const gap = carried.seam ? seamHeight(carried.seam) : cal.medGap;
		async function uncertified(reason: string): Promise<ChainPlan> {
			addSeg(slot!.spillPage, legacySeg(slot!, carried, gap, floorB));
			exact = false;
			deps.emit('chain-hop', { page: slot!.spillPage, certified: false, reason });
			return finish(reason);
		}
		if (!skelB) return uncertified(!seamIts ? 'no-seam' : topSkip <= 0 ? 'no-topskip' : 'no-skeleton');
		const c0 = await deps.splitSkeleton(skelB.items, skelB.target);
		if (!c0.ok || c0.kB !== 0 || c0.kA !== skelB.boxYs.length) return uncertified('cal-count');
		let calDev = 0;
		for (let k = 0; k < skelB.boxYs.length; k++) calDev = Math.max(calDev, Math.abs(skelB.top + c0.ys[k] - skelB.boxYs[k]));
		if (calDev > CAL_DEV) return uncertified('cal-dev');
		// the landing rule the page builder uses: the column's first baseline sits at
		// \topskip below the body top unless the box is taller than \topskip
		const bodyTop = skelB.top + skelB.boxHs[0] - Math.max(topSkip, skelB.boxHs[0]);
		const topEdge = bodyTop + Math.max(topSkip, hFirst) - hFirst;
		const capacity = deps.colBottomOf(slot.spillPage) - topEdge;
		const spliced = [...carried.items, ...seamIts!, ...skelB.items];
		const nCarried = carried.oldBases.length;
		const total = nCarried + skelB.boxYs.length;
		const cf = await deps.splitSkeleton(spliced, capacity, true);
		if (!cf.ok || cf.kA + cf.kB !== total || cf.ys.length !== cf.kA || cf.kA < nCarried) return uncertified('hop-split');
		const hopYs = cf.ys;
		const newBases = carried.oldBases.map((_, j) => topEdge + hopYs[j]);
		const stayCount = cf.kA - nCarried;
		const staySteps = [];
		for (let j = 0; j < stayCount; j++)
			staySteps.push({ y: skelB.boxYs[j] - skelB.boxHs[j] - 0.01, dy: topEdge + hopYs[nCarried + j] - skelB.boxYs[j] });
		const delta = staySteps[0]?.dy ?? 0;
		// old-position boundary between the last stay and the first carried-away box; the
		// clip predicate adds the rigid delta, so offset the boundary by it
		const clipMid =
			stayCount >= skelB.boxYs.length
				? undefined
				: stayCount === 0
					? skelB.top - 1
					: (skelB.boxYs[stayCount - 1] +
							boxDim(skelB.items, skelB.boxIdx[stayCount - 1]).d +
							skelB.boxYs[stayCount] -
							skelB.boxHs[stayCount]) /
						2;
		addSeg(slot.spillPage, {
			top: 0,
			dropTop: bodyTop - 2,
			dropBottom: bodyTop - 2,
			delta,
			paraLeft: slot.movedDx,
			colL: slot.colLB,
			colR: slot.colRB,
			newRecs: remapCarried(carried.recs, carried.oldBases, newBases),
			flowSteps: staySteps.length ? staySteps : undefined,
			clipBottom: clipMid === undefined ? undefined : clipMid + delta,
			flowBottom: floorB
		});
		const fills = deps.columnFills(slot.spillPage, slot.col);
		deps.emit('chain-hop', {
			page: slot.spillPage,
			col: slot.col,
			certified: true,
			kA: cf.kA,
			kB: cf.kB,
			calDev: +calDev.toFixed(3),
			fills
		});
		// the split packs to the goal EXACTLY, so its spacing is the engine's only where the
		// engine also filled THIS column; a fil-terminated one (the document's last column
		// included) leaves its rows at natural spacing and an exact respace would spread them.
		// Asked per column: the older page-wide inference condemned every column of a page for
		// one fil anywhere on it, including page furniture above the columns entirely.
		if (!fills) exact = false;
		if (cf.kB === 0) {
			if (exact) exact = await absorbConfirmed(deps, ctx, seams, cal, slot, skelB, recsB, spliced, capacity, total);
			return finish('absorbed');
		}
		const clipY = clipMid ?? skelB.top - 1;
		const nextCol = columnIndexOf(recsB, cal.W, slot.colLB);
		carried = {
			recs: carriedRecords(recsB, slot.colLB, slot.colRB, clipY, floorB),
			oldBases: skelB.boxYs.slice(stayCount),
			items: skelB.items.slice(skelB.boxIdx[stayCount]),
			from: { pageNo: slot.spillPage, colL: slot.colLB, colR: slot.colRB, W: cal.W, medGap: cal.medGap },
			srcCol: nextCol,
			seam: nextCol > 0 ? seamAfter(seams, slot.spillPage, nextCol, recsB, cal.W) : null
		};
		if (!carried.recs.some((x: any) => x.y !== undefined)) {
			exact = false;
			return finish('no-carried-ink');
		}
		if (carried.seam && seamForced(carried.seam)) {
			exact = false;
			return finish('forced-ahead');
		}
	}
	exact = false;
	return finish('max-hops');
}

// kB=0 said the column holds [carried + its content] -- but a greedy page builder with
// real slack would PULL the next column's first line up, which this render does not show.
// Probe: offer that first line too; the engine refusing it certifies the break stays.
async function absorbConfirmed(
	deps: ChainDeps,
	ctx: OverflowContext,
	seams: SeamEntry[],
	cal: Cal,
	slot: { spillPage: number; colLB: number; colRB: number },
	skelB: PageSkeleton,
	recsB: PageRecord[],
	spliced: SkelItem[],
	capacity: number,
	total: number
): Promise<boolean> {
	const col = columnIndexOf(recsB, cal.W, slot.colLB);
	const seam = col > 0 ? seamAfter(seams, slot.spillPage, col, recsB, cal.W) : null;
	if (seam && seamForced(seam)) return true; // nothing can be pulled across \newpage
	const onward = nextSlot(
		ctx,
		{ pageNo: slot.spillPage, colL: slot.colLB, colR: slot.colRB, W: cal.W, medGap: cal.medGap },
		skelB.boxHs[0]
	);
	if (!onward) return true; // document's last column: nothing below to pull
	const its = seam ? seamItems(seam) : null;
	if (!its) return false;
	const nextRecs = ctx.pageRecords(onward.spillPage);
	const probePl = (nextRecs as any[])
		.filter((r) => r.t === 'pl' && Math.abs(r.w - cal.W) <= 2 && r.x >= onward.colLB && r.x <= onward.colRB && r.h !== undefined)
		.sort((a, b) => a.y - b.y)[0];
	if (!probePl) return false;
	const probe = await deps.splitSkeleton([...spliced, ...its, { t: 'b', h: probePl.h, d: probePl.d }], capacity, true);
	if (!probe.ok || probe.kA + probe.kB !== total + 1) return false;
	const stays = probe.kA <= total;
	deps.emit('chain-probe', { page: slot.spillPage, pulls: !stays });
	return stays;
}
