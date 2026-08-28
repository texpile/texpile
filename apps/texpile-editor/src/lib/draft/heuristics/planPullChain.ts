import { nextSlot, type OverflowContext, type SlotFrom } from './nextSlot';
import { buildPageSkeleton, type PageSkeleton, type SkelItem } from './pageSkeleton';
import { carriedRecords, remapCarried } from './carryRecords';
import { seamAfter, seamItems, columnIndexOf } from './seams';
import { remapBandRecords, type ShrinkSeed } from '../patch/pageCertificate';
import type { ChainDeps } from './planBreakChain';
import type { Cal } from '../locate/locate.types';
import type { PageRecord } from '../geometry/geometry.types';
import type { Patch } from '../patch/patch.types';

export type PullPlan = {
	// segments grouped by page, edit page first, in flow order
	pages: { page: number; segs: Patch[] }[];
	// rows pulled into the edit column, and donor columns respaced
	pulled: number;
	hops: number;
	exact: boolean;
	endPage: number;
	bandTop: number;
};

const CAL_DEV = 0.15;
const MAX_HOPS = 4;

type Donor = {
	slot: NonNullable<ReturnType<typeof nextSlot>>;
	its: SkelItem[];
	skel: PageSkeleton;
};

function boxDim(items: SkelItem[], idx: number): { h: number; d: number } {
	return items[idx] as { t: 'b'; h: number; d: number };
}

// The pull chain: a shrunk band frees room at its column bottom, and the greedy page
// builder fills it from the next slot in reading order -- which frees room THERE, and so
// on. Each hop is one capacity split of [column rest + captured seam + donor column]:
// kA names how many donor boxes climb back, and the ys respace the column, pulled rows
// included. A forced seam needs no special case -- its restored -10000 penalty makes the
// engine itself refuse the pull. Renders all-or-nothing: any uncertifiable hop returns
// null and today's shrink render (no pull, tinted) stands.
export async function planPullChain(
	deps: ChainDeps,
	ctx: OverflowContext,
	cal: Cal,
	daemonRecs: PageRecord[],
	seed: ShrinkSeed,
	g: { y0: number; h1: number; dk: number; floorA: number },
	topSkip: number
): Promise<PullPlan | null> {
	if (topSkip <= 0) return null;
	const seams = deps.seams();

	// donor of the column `from`: the next slot's calibrated skeleton plus the junction
	// seam. 'none' = the document ends here; 'blocked' = no certifiable engine answer.
	async function donorOf(from: SlotFrom, h1First: number): Promise<Donor | 'none' | 'blocked'> {
		const slot = nextSlot(ctx, from, h1First);
		if (!slot) return 'none';
		// an RTL donor keeps its raster: its head would stay on screen under the pulled copy
		if (deps.pageIsRtl(slot.spillPage)) return 'blocked';
		const fromRecs = ctx.pageRecords(from.pageNo);
		const col = columnIndexOf(fromRecs, cal.W, from.colL);
		const seam = col > 0 ? seamAfter(seams, from.pageNo, col, fromRecs, cal.W) : null;
		const its = seam ? seamItems(seam) : null;
		if (!its) return 'blocked';
		const skel = buildPageSkeleton(ctx.pageRecords(slot.spillPage), slot.colLB, slot.colRB);
		if (!skel) return 'blocked';
		const c0 = await deps.splitSkeleton(skel.items, skel.target);
		if (!c0.ok || c0.kB !== 0 || c0.kA !== skel.boxYs.length) return 'blocked';
		let dev = 0;
		for (let k = 0; k < skel.boxYs.length; k++) dev = Math.max(dev, Math.abs(skel.top + c0.ys[k] - skel.boxYs[k]));
		return dev > CAL_DEV ? 'blocked' : { slot, its, skel };
	}

	const pages: PullPlan['pages'] = [];
	function addSeg(page: number, seg: Patch): void {
		const entry = pages.find((p) => p.page === page);
		if (entry) entry.segs.push(seg);
		else pages.push({ page, segs: [seg] });
	}

	// ---- hop 0: the edited column asks its donor ----
	const skel = seed.skel;
	const oldBand = seed.toBox - seed.fromBox + 1;
	function toOld(n: number): number {
		return n + oldBand - seed.bandBoxes;
	}
	const from0: SlotFrom = { pageNo: cal.pageNo, colL: cal.colL, colR: cal.colR, W: cal.W, medGap: cal.medGap };
	const donor0 = await donorOf(from0, boxDim(seed.items, 0).h);
	if (donor0 === 'blocked') return null;
	const capacity0 = deps.colBottomOf(cal.pageNo) - seed.top;
	const items0 = donor0 === 'none' ? seed.items : [...seed.items, ...donor0.its, ...donor0.skel.items];
	const total0 = seed.boxesAfter + (donor0 === 'none' ? 0 : donor0.skel.boxYs.length);
	const r0 = await deps.splitSkeleton(items0, capacity0, true);
	if (!r0.ok || r0.kA + r0.kB !== total0 || r0.ys.length !== r0.kA || r0.kA < seed.boxesAfter) return null;
	let pulled = r0.kA - seed.boxesAfter;
	if (donor0 !== 'none' && pulled >= donor0.skel.boxYs.length) return null; // whole-column drain: out of model
	// certified geometry for the edit column
	const bandAbsYs: number[] = [];
	for (let j = 0; j < seed.bandBoxes; j++) bandAbsYs.push(seed.top + r0.ys[seed.fromBox + j]);
	const bandRecs = remapBandRecords(daemonRecs, bandAbsYs, cal.b1 - g.y0);
	if (!bandRecs) return null;
	const steps0 = [];
	let maxAboveDy = 0;
	for (let n = 0; n < seed.boxesAfter; n++) {
		if (n >= seed.fromBox && n < seed.fromBox + seed.bandBoxes) continue;
		const k = n < seed.fromBox ? n : toOld(n);
		const dy = seed.top + r0.ys[n] - skel.boxYs[k];
		if (n < seed.fromBox) maxAboveDy = Math.max(maxAboveDy, Math.abs(dy));
		else steps0.push({ y: skel.boxYs[k] - skel.boxHs[k] - 0.01, dy });
	}
	if (maxAboveDy > 2) return null;
	let exact = maxAboveDy <= 0.2;
	addSeg(cal.pageNo, {
		top: cal.b1 - g.y0,
		dropTop: cal.b1 - Math.max(g.h1, g.y0) - 2,
		dropBottom: cal.bk + g.dk + 2,
		delta: 0,
		paraLeft: cal.paraLeft,
		colL: cal.colL,
		colR: cal.colR,
		newRecs: bandRecs,
		flowSteps: steps0.length ? steps0 : undefined,
		flowBottom: g.floorA
	});
	let hops = 0;
	let endPage = cal.pageNo;
	function hopBudget(h: number): boolean {
		return h < MAX_HOPS;
	}
	function finish(reason: string): PullPlan {
		deps.emit('pull-end', { hops, exact, reason, endPage, pulled });
		return { pages, pulled, hops, exact, endPage, bandTop: cal.b1 - g.y0 };
	}
	if (donor0 === 'none') {
		// document's last column: 'exactly' only tells the truth when trailing fil glue
		// absorbed the freed room
		exact = exact && r0.go > 0;
		return finish('doc-end');
	}
	if (pulled === 0) {
		// the engine says the break holds (penalties, or the donor's first line is too
		// tall for the freed room): the column respaces and the donor is untouched
		return finish('no-pull');
	}

	// pulled rows join the edit column as an insert segment (their own dx)
	let donor = donor0;
	let receiveTopAbs = seed.top;
	let receiveCount = seed.boxesAfter;
	let split = r0;
	let receivePage = cal.pageNo;
	let receiveColL = cal.colL;
	let receiveColR = cal.colR;
	while (true) {
		hops++;
		endPage = donor.slot.spillPage;
		const D = donor.skel;
		const bodyTopD = D.top + D.boxHs[0] - Math.max(topSkip, D.boxHs[0]);
		const clipPull = (D.boxYs[pulled - 1] + boxDim(D.items, D.boxIdx[pulled - 1]).d + D.boxYs[pulled] - D.boxHs[pulled]) / 2;
		const pulledRecs = carriedRecords(ctx.pageRecords(donor.slot.spillPage), donor.slot.colLB, donor.slot.colRB, bodyTopD - 2, clipPull);
		// the insert wears the RECEIVING column's window, so the donor's existing records
		// keep matching the donor's own wipe segment
		addSeg(receivePage, {
			top: 0,
			dropTop: -1e4,
			dropBottom: -1e4,
			delta: 0,
			paraLeft: -donor.slot.movedDx,
			colL: receiveColL,
			colR: receiveColR,
			newRecs: remapCarried(
				pulledRecs,
				D.boxYs.slice(0, pulled),
				Array.from({ length: pulled }, (_, j) => receiveTopAbs + split.ys[receiveCount + j])
			),
			flowBottom: ctx.contentFloor(receivePage)
		});
		// the donor lost its head: respace the rest, asking ITS donor about the next pull
		const rest = D.items.slice(D.boxIdx[pulled]);
		const restYs = D.boxYs.slice(pulled);
		const restHs = D.boxHs.slice(pulled);
		const topEdgeD = bodyTopD + Math.max(topSkip, restHs[0]) - restHs[0];
		const capacityD = deps.colBottomOf(donor.slot.spillPage) - topEdgeD;
		const fromD: SlotFrom = {
			pageNo: donor.slot.spillPage,
			colL: donor.slot.colLB,
			colR: donor.slot.colRB,
			W: cal.W,
			medGap: cal.medGap
		};
		const next = hopBudget(hops) ? await donorOf(fromD, restHs[0]) : 'blocked';
		const items = next === 'none' || next === 'blocked' ? rest : [...rest, ...next.its, ...next.skel.items];
		const total = restYs.length + (next === 'none' || next === 'blocked' ? 0 : next.skel.boxYs.length);
		const r = await deps.splitSkeleton(items, capacityD, true);
		if (!r.ok || r.kA + r.kB !== total || r.ys.length !== r.kA || r.kA < restYs.length) return null;
		const pulledNext = r.kA - restYs.length;
		if (next !== 'none' && next !== 'blocked' && pulledNext >= next.skel.boxYs.length) return null;
		const steps = restYs.map((y, j) => ({ y: y - restHs[j] - 0.01, dy: topEdgeD + r.ys[j] - y }));
		addSeg(donor.slot.spillPage, {
			top: 0,
			dropTop: bodyTopD - 2,
			dropBottom: clipPull,
			delta: steps[0]?.dy ?? 0,
			paraLeft: 0,
			colL: donor.slot.colLB,
			colR: donor.slot.colRB,
			newRecs: [],
			flowSteps: steps.length ? steps : undefined,
			flowBottom: ctx.contentFloor(donor.slot.spillPage)
		});
		deps.emit('pull-hop', { page: donor.slot.spillPage, pulled, next: pulledNext });
		// the donor's rest is packed to its goal EXACTLY: only a page the engine also fills
		// respaces that way (see the same guard in planBreakChain)
		if (!deps.columnFills(donor.slot.spillPage, donor.slot.col)) exact = false;
		if (next === 'none') {
			exact = exact && r.go > 0;
			return finish('doc-end');
		}
		if (next === 'blocked') {
			// the rest respaced without asking about the next pull the engine might make
			exact = false;
			return finish('blocked');
		}
		if (pulledNext === 0) return finish('no-pull');
		receivePage = donor.slot.spillPage;
		receiveColL = donor.slot.colLB;
		receiveColR = donor.slot.colRB;
		receiveTopAbs = topEdgeD;
		receiveCount = restYs.length;
		split = r;
		donor = next;
		pulled = pulledNext;
	}
}
