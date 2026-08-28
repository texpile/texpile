import type { Patch } from './patch.types';

export type SpillHooks = {
	applyPatch: (n: number, p: Patch | Patch[]) => Promise<void>;
	clearPatch: (n: number) => Promise<void>;
};

// Cross-page spill bookkeeping. A spill render leaves a patch on ANOTHER page; when the
// same paragraph's next render stops targeting that page, the stale segment must come
// off it, or the carried rows double-draw (old copy at the spill top, restored copy on
// the edit page) for the rest of the typing burst. The paired paint also must not span
// a compile landing: the second segment would re-register on pages the landing cleared.
export class SpillPatches {
	private spill: { key: string; page: number } | null = null;

	constructor(private hooks: SpillHooks) {}

	/** a compile landed: activePatch was cleared wholesale, nothing left to track */
	reset(): void {
		this.spill = null;
	}

	/** clear the tracked spill segment unless this render keeps painting its page */
	async drop(key: string, keptPage: number): Promise<void> {
		if (!this.spill || this.spill.key !== key) return;
		const page = this.spill.page;
		this.spill = null;
		if (page !== keptPage) await this.hooks.clearPatch(page);
	}

	/** paint segA on pageNo and segsB on spillPage; false = aborted on a stale epoch */
	async paint(key: string, pageNo: number, spillPage: number, segA: Patch, segsB: Patch[], stale: () => boolean): Promise<boolean> {
		await this.drop(key, spillPage);
		if (spillPage === pageNo) {
			// one canvas: the band segment and the next-slot insert segments compose there
			await this.hooks.applyPatch(pageNo, [segA, ...segsB]);
			return true;
		}
		await this.hooks.applyPatch(pageNo, segA);
		if (stale()) {
			await this.hooks.clearPatch(pageNo);
			return false;
		}
		await this.hooks.applyPatch(spillPage, segsB.length === 1 ? segsB[0] : segsB);
		this.spill = { key, page: spillPage };
		return true;
	}
}
