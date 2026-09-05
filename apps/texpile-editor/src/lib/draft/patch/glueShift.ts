/* eslint-disable @typescript-eslint/no-explicit-any */
// How a height change moves the content below a band on a STRETCHED page. TeX's vpack
// distributes linearly over glue by stretch order (packaging.c: glue_set = x /
// total_stretch[o]) -- with the page's real vg records this is the engine's own
// arithmetic, not a model of it. On a flushbottom page the bottom line stays pinned;
// rigid shifting there is what verifyPatches used to grade as drift.
//
// The band itself stays anchored (glue above it also stretches in a true repack; that
// second-order share is the residual the full pass corrects) -- so a render on these
// steps is exact only under a full page-break certificate, and refused otherwise.

export type FlowStep = { y: number; dy: number };

/**
 * piecewise shift for below-band content, from the column's stretchable glue between the
 * band bottom and the flow floor. null = no usable glue (or a rigid page): shift the
 * constant delta, exactly as before.
 */
export function flowShiftSteps(
	pageRecs: any[],
	bandBottom: number,
	floor: number,
	colL: number,
	colR: number,
	delta: number
): FlowStep[] | null {
	if (!delta) return null;
	// growth consumes shrink, shrinkage consumes stretch
	const cap = delta > 0 ? 'sh' : 'st';
	const ord = delta > 0 ? 'sho' : 'sto';
	const vg = pageRecs.filter(
		(r) => r.t === 'vg' && (r[cap] ?? 0) > 0 && (r.x === undefined || (r.x >= colL && r.x <= colR)) && r.y > bandBottom && r.y <= floor
	);
	if (!vg.length) return null;
	// only the highest order present absorbs (fil swallows everything below it)
	const maxOrd = Math.max(...vg.map((g) => g[ord] ?? 0));
	const usable = vg.filter((g) => (g[ord] ?? 0) === maxOrd).sort((a, b) => a.y - b.y);
	const total = usable.reduce((s, g) => s + g[cap], 0);
	if (!(total > 0)) return null;
	let cum = 0;
	const steps: FlowStep[] = [];
	for (const g of usable) {
		cum += g[cap];
		steps.push({ y: g.y, dy: delta * (1 - cum / total) || 0 });
	}
	return steps;
}

/** the shift for content at y: full delta above the first glue, decaying to 0 past the last */
export function flowDyAt(steps: FlowStep[] | undefined | null, y: number, delta: number): number {
	if (!steps?.length) return delta;
	let dy = delta;
	for (const s of steps) {
		if (y > s.y) dy = s.dy;
		else break;
	}
	return dy;
}
