import type { FlowStep } from './glueShift';
import type { PageSkeleton, SkelItem } from '../heuristics/pageSkeleton';

// What the renderer needs to SHOW a moved break: certified baselines for everything the
// engine keeps on this column, and the identity (old baselines) of the boxes it carries
// to the next slot. Derived from the capacity split the certificate already ran. The
// hop planner re-splits the receiving column with carriedItems on top, and refuses
// unless every junction has captured seam data.
export type BreakMotion = {
	// certified page-absolute baselines for the band lines (the break falls below the band)
	bandAbsYs: number[];
	// engine respace of the below-band boxes that stay, thresholded at each box top
	staySteps: FlowStep[];
	// OLD page-absolute baselines of the boxes the engine carries out, in column order
	movedBases: number[];
	// the carried run as skeleton items (first carried box to column end; the glue at the
	// new break above it is pruned in a real re-break, so the run starts AT the box)
	carriedItems: SkelItem[];
	// old-position boundary separating the last staying row from the first carried row
	clipY: number;
	maxAboveDy: number;
};

// null when the break lands inside or above the band: the carried set would then mix
// daemon band records with page records in two coordinate frames; that case takes
// the full pass.
export function breakMotion(
	skel: PageSkeleton,
	top: number,
	bandBoxes: number,
	fromBox: number,
	toBox: number,
	split: { kA: number; kB: number; ys: number[]; nys?: number[] },
	boxesAfter: number,
	// did the engine FILL this column? A column it left short -- the document's last page,
	// every page of a raggedbottom class -- stacks at natural glue, and reading it as
	// stretched spreads its rows. That spread then reads as content ABOVE the band needing
	// to move, which costs the render its exactness for a layout difference that is not there.
	fills = true
): BreakMotion | null {
	const ys = fills ? split.ys : (split.nys ?? split.ys);
	const oldBand = toBox - fromBox + 1;
	function toOld(n: number): number {
		return n + oldBand - bandBoxes;
	}
	if (split.kA < fromBox + bandBoxes || split.kA >= boxesAfter) return null;
	if (split.kA + split.kB !== boxesAfter || ys.length !== split.kA) return null;
	const bandAbsYs: number[] = [];
	for (let j = 0; j < bandBoxes; j++) bandAbsYs.push(top + ys[fromBox + j]);
	const staySteps: FlowStep[] = [];
	let maxAboveDy = 0;
	for (let n = 0; n < split.kA; n++) {
		if (n >= fromBox && n < fromBox + bandBoxes) continue;
		const k = n < fromBox ? n : toOld(n);
		const dy = top + ys[n] - skel.boxYs[k];
		if (n < fromBox) maxAboveDy = Math.max(maxAboveDy, Math.abs(dy));
		// threshold at the box TOP so the whole line moves together
		else staySteps.push({ y: skel.boxYs[k] - skel.boxHs[k] - 0.01, dy });
	}
	function depth(k: number): number {
		return (skel.items[skel.boxIdx[k]] as { t: 'b'; h: number; d: number }).d;
	}
	const movedBases: number[] = [];
	for (let n = split.kA; n < boxesAfter; n++) movedBases.push(skel.boxYs[toOld(n)]);
	const kFirst = toOld(split.kA);
	const carriedTop = skel.boxYs[kFirst] - skel.boxHs[kFirst];
	// last staying content in OLD coordinates; the band's old extent when nothing below
	// it stays (its region is wiped by the band drop anyway)
	const kPrev = split.kA > fromBox + bandBoxes ? toOld(split.kA - 1) : toBox;
	const prevBottom = skel.boxYs[kPrev] + depth(kPrev);
	return {
		bandAbsYs,
		staySteps,
		movedBases,
		carriedItems: skel.items.slice(skel.boxIdx[kFirst]),
		clipY: (prevBottom + carriedTop) / 2,
		maxAboveDy
	};
}
