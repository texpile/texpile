/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageRecord } from '../geometry/geometry.types';

// Does the engine fill this page's columns to their goal? A capacity split packs its box
// to the goal EXACTLY, so its spacing is the engine's own only where the engine also
// packed to the goal. When the slack went into infinite-order glue instead -- the last
// page's \clearpage \vfil, a \newpage, \raggedbottom's \@textbottom -- every row sits at
// NATURAL spacing and that respace would spread the column down the page.
//
// Finite-order stretch set off natural is the positive evidence; a body fil that absorbed
// slack is the disqualifier. The fil test must stay inside the body: every page carries
// fil glue in the header/footer region at y <= 0.
export function packsToGoal(recs: PageRecord[]): boolean {
	let finite = false;
	for (const r of recs as any[]) {
		if (r.t !== 'vg' || r.nw === undefined) continue;
		const off = Math.abs(r.w - r.nw) > 0.05;
		if (!off) continue;
		if ((r.sto ?? 0) > 0) {
			if ((r.y ?? 0) > 0) return false;
		} else finite = true;
	}
	return finite;
}
