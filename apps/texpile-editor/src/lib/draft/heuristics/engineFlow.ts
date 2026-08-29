import { planBreakChain, type ChainDeps } from './planBreakChain';
import { planPullChain } from './planPullChain';
import { remapBandRecords, type Certificate } from '../patch/pageCertificate';
import type { OverflowContext } from './nextSlot';
import type { Cal } from '../locate/locate.types';
import type { PageRecord } from '../geometry/geometry.types';
import type { Patch } from '../patch/patch.types';

export type FlowRender = {
	plan: { pages: { page: number; segs: Patch[] }[]; exact: boolean; endPage: number; hops: number };
	band: { top: number; bottom: number };
	ev: { kind: string; stage: string; detail: Record<string, unknown> };
};

// The engine's own answer to a break that moved or a column that shrank, rendered as a
// multi-page flow. A moved break chains forward through the next slots (one engine split
// per receiving column); a shrunk band asks what the page builder pulls back. Either
// renders EXACT when every hop certifies, else first-order and tinted. null = no engine
// answer to render, and the caller's existing paths stand.
export async function engineFlow(
	deps: ChainDeps,
	ctx: OverflowContext,
	cal: Cal,
	cert: Certificate,
	daemonRecs: PageRecord[],
	g: { y0: number; h1: number; dk: number; floorA: number },
	topSkip: number
): Promise<FlowRender | null> {
	if (!cert.fits && cert.moved) {
		const bandRecs = remapBandRecords(daemonRecs, cert.moved.bandAbsYs, cal.b1 - g.y0);
		// the certificate named a break but the band could not be remapped onto it -- the
		// band's OWN lines are among the ones leaving, so it has more lines than the
		// certificate has baselines for. Named because it is otherwise invisible: the log
		// jumps from skel-break-moved straight to the tint, with nothing saying the motion
		// went unrendered.
		if (!bandRecs) deps.emit('chain-end', { reason: 'band-unmapped', bandYs: cert.moved.bandAbsYs.length });
		const plan = bandRecs ? await planBreakChain(deps, ctx, cal, bandRecs, cert.moved, g, topSkip) : null;
		if (!plan) return null;
		return {
			plan,
			band: { top: plan.pages[0].segs[0].top, bottom: cal.bk + g.dk },
			ev: {
				kind: 'patched-chain',
				stage: 'engine-overflow',
				detail: { moved: plan.carried, target: plan.samePage ? 'next-col' : 'next-page' }
			}
		};
	}
	if (!cert.shrunk) return null;
	const pull = await planPullChain(deps, ctx, cal, daemonRecs, cert.shrunk, g, topSkip);
	if (!pull) return null;
	return {
		plan: pull,
		band: { top: pull.bandTop, bottom: cal.bk + g.dk },
		ev: { kind: 'patched-pull', stage: 'engine-pull', detail: { moved: pull.pulled, target: 'pull-back' } }
	};
}
