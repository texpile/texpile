import type { FlowStep } from './glueShift';
import type { PageSkeleton } from '../heuristics/pageSkeleton';

export type CertifiedFlow = {
	bandAbsYs: number[];
	steps: FlowStep[];
	maxAboveDy: number;
};

// Read a split's baselines back onto the page: the band's own, respace steps for what sits
// below it, and the largest displacement ABOVE it. The renderer never moves that region, so a
// visible value there is what costs a certificate its exactness rather than its validity.
//
// Shared by both certificate branches because the index mapping is the same question -- box k
// of the OLD column is box k, or box k less the old band plus the new one.
export function certifiedFlow(
	skel: PageSkeleton,
	top: number,
	fromBox: number,
	toBox: number,
	bandBoxes: number,
	ys: number[]
): CertifiedFlow {
	const bandAbsYs: number[] = [];
	for (let j = 0; j < bandBoxes; j++) bandAbsYs.push(top + ys[fromBox + j]);
	const steps: FlowStep[] = [];
	let maxAboveDy = 0;
	for (let k = 0; k < skel.boxYs.length; k++) {
		if (k >= fromBox && k <= toBox) continue;
		const kNew = k < fromBox ? k : k - (toBox - fromBox + 1) + bandBoxes;
		const dy = top + ys[kNew] - skel.boxYs[k];
		if (k < fromBox) maxAboveDy = Math.max(maxAboveDy, Math.abs(dy));
		// threshold at the box TOP so the whole line moves together
		else steps.push({ y: skel.boxYs[k] - skel.boxHs[k] - 0.01, dy });
	}
	return { bandAbsYs, steps, maxAboveDy };
}
