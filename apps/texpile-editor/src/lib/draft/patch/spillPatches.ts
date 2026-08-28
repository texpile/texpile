import type { Patch } from './patch.types';

export type SpillHooks = {
	applyPatch: (n: number, p: Patch | Patch[]) => Promise<void>;
	clearPatch: (n: number) => Promise<void>;
};

// Cross-page spill bookkeeping. A flow render spans several pages: one segment CLIPS the
// carried rows off the edit page and the others re-draw them further on, so the whole
// chain has to come off together -- clearing only the receiving pages would leave the
// clip in place and the rows would exist on no page at all. The tracked set is therefore
// the whole chain, and any render that stops repainting a tracked page takes that page's
// segment off. Only one paragraph renders at a time, so one set suffices. A multi-page
// paint also must not span a compile landing: later segments would re-register on pages
// the landing cleared, so the paint checks the epoch before every page after the first
// and unwinds what it already painted.
export class SpillPatches {
	private pages: number[] = [];

	constructor(private hooks: SpillHooks) {}

	/** a compile landed: activePatch was cleared wholesale, nothing left to track */
	reset(): void {
		this.pages = [];
	}

	/** clear tracked spill segments except on the page this render keeps painting */
	async drop(keptPage: number): Promise<number[]> {
		const stale = this.pages.filter((p) => p !== keptPage);
		this.pages = [];
		for (const p of stale) await this.hooks.clearPatch(p);
		return stale;
	}

	/** paint page by page, edit page first; the cleared orphans, or null on a stale epoch */
	async paint(entries: { page: number; segs: Patch[] }[], stale: () => boolean): Promise<number[] | null> {
		// one applyPatch per page: same-page segments compose on one canvas
		const merged: { page: number; segs: Patch[] }[] = [];
		for (const e of entries) {
			const m = merged.find((x) => x.page === e.page);
			if (m) m.segs.push(...e.segs);
			else merged.push({ page: e.page, segs: [...e.segs] });
		}
		const target = new Set(merged.map((e) => e.page));
		const orphaned = this.pages.filter((p) => !target.has(p));
		this.pages = [];
		for (const p of orphaned) await this.hooks.clearPatch(p);
		const painted: number[] = [];
		for (const e of merged) {
			if (painted.length && stale()) {
				for (const p of painted) await this.hooks.clearPatch(p);
				return null;
			}
			await this.hooks.applyPatch(e.page, e.segs.length === 1 ? e.segs[0] : e.segs);
			painted.push(e.page);
		}
		this.pages = merged.map((e) => e.page);
		return orphaned;
	}
}
