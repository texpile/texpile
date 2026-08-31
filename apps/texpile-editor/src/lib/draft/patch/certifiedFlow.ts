import type { FlowStep } from './glueShift';
import type { PageSkeleton } from '../heuristics/pageSkeleton';

export type CertifiedFlow = {
	bandAbsYs: number[];
	steps: FlowStep[];
	// the same respace for the boxes ABOVE the band. The engine answers for the whole column,
	// so these were always computed -- and then reduced to their maximum and thrown away,
	// because the painter had no way to move that region and the tint was the price.
	aboveSteps: FlowStep[];
	maxAboveDy: number;
};

// Read a split's baselines back onto the page: the band's own, and respace steps for every
// other box in the column. maxAboveDy rides along as the one number that says whether the
// region above the band moved at all, which several callers still decide on.
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
	const aboveSteps: FlowStep[] = [];
	let maxAboveDy = 0;
	for (let k = 0; k < skel.boxYs.length; k++) {
		if (k >= fromBox && k <= toBox) continue;
		const kNew = k < fromBox ? k : k - (toBox - fromBox + 1) + bandBoxes;
		const dy = top + ys[kNew] - skel.boxYs[k];
		// threshold at the box TOP so the whole line moves together
		const step = { y: skel.boxYs[k] - skel.boxHs[k] - 0.01, dy };
		if (k < fromBox) {
			maxAboveDy = Math.max(maxAboveDy, Math.abs(dy));
			aboveSteps.push(step);
		} else steps.push(step);
	}
	return { bandAbsYs, steps, aboveSteps, maxAboveDy };
}
