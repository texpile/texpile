// Knuth and Plass's total fit line breaking over boxes, glue and penalties
export type BoxItem = { kind: 'box'; width: number };
export type GlueItem = { kind: 'glue'; width: number; stretch: number; shrink: number };
/** cost -Infinity forces a break, Infinity forbids one; flagged marks a line that would end in a hyphen */
export type PenaltyItem = { kind: 'penalty'; width: number; cost: number; flagged: boolean; fromPatterns: boolean };
export type LineItem = BoxItem | GlueItem | PenaltyItem;

export type LineBreakPass = {
	/** the paragraph's first line, which an indent makes shorter */
	firstLineWidth: number;
	lineWidth: number;
	/** the worst badness a line may have; Infinity accepts any line that is not too long */
	tolerance: number;
	/** whether breaks found by hyphenation patterns may be taken */
	hyphenate: boolean;
	/** stretch every line is given on top of its own, so lines with little of it still rank by how short they fall (TeX's \emergencystretch) */
	emergencyStretch?: number;
};

// plain TeX's values
const LINE_PENALTY = 10;
const DOUBLE_HYPHEN_DEMERITS = 10000;
const FINAL_HYPHEN_DEMERITS = 5000;
const ADJACENT_FITNESS_DEMERITS = 10000;
// a line with nothing to stretch still needs a finite cost, or the last pass cannot rank such lines
const WORST_RATIO = 50;
const FITNESS_CLASSES = 4;

// one node for each fitness class at a break is enough: every line after the first has the same width, so what
// follows a break does not depend on how many lines came before it
type BreakNode = {
	item: number;
	fitness: number;
	width: number;
	stretch: number;
	shrink: number;
	demerits: number;
	previous: BreakNode | null;
};

function fitnessOf(ratio: number): number {
	if (ratio < -0.5) return 0;
	if (ratio <= 0.5) return 1;
	return ratio <= 1 ? 2 : 3;
}

function isForced(item: LineItem): boolean {
	return item.kind === 'penalty' && item.cost === -Infinity;
}

/** indexes of the items each line ends at, the closing forced break included, or null when nothing fits. A line is taken to end at `after` already, and only what follows is broken */
export function breakLines(items: LineItem[], pass: LineBreakPass, after = -1): number[] | null {
	let width = 0;
	let stretch = 0;
	let shrink = 0;
	const active: BreakNode[] = [];
	if (after < 0) active.push({ item: -1, fitness: 1, width: 0, stretch: 0, shrink: 0, demerits: 0, previous: null });
	const bestDemerits = new Float64Array(FITNESS_CLASSES);
	const bestFrom: Array<BreakNode | null> = [null, null, null, null];

	// what a line starting after a break here has behind it: glue and penalties right after a break are dropped
	function totalsAfter(index: number): Pick<BreakNode, 'width' | 'stretch' | 'shrink'> {
		const totals = { width, stretch, shrink };
		for (let i = index; i < items.length; i++) {
			const next = items[i];
			if (next.kind === 'box' || (i > index && isForced(next))) break;
			if (next.kind !== 'glue') continue;
			totals.width += next.width;
			totals.stretch += next.stretch;
			totals.shrink += next.shrink;
		}
		return totals;
	}

	function breakAt(index: number): void {
		const item = items[index];
		const forced = isForced(item);
		const flagged = item.kind === 'penalty' && item.flagged;
		const cost = item.kind === 'penalty' ? item.cost : 0;
		const ownWidth = item.kind === 'penalty' ? item.width : 0;
		const last = index === items.length - 1;
		bestDemerits.fill(Infinity);
		bestFrom.fill(null);
		let kept = 0;
		for (const from of active) {
			const target = from.item < 0 ? pass.firstLineWidth : pass.lineWidth;
			const alone = width - from.width;
			if (!forced && alone <= target + (shrink - from.shrink)) active[kept++] = from;
			const natural = alone + ownWidth;
			const give = stretch - from.stretch + (pass.emergencyStretch ?? 0);
			let ratio = 0;
			if (natural < target) ratio = give > 0 ? Math.min((target - natural) / give, WORST_RATIO) : WORST_RATIO;
			else if (natural > target) ratio = shrink > from.shrink ? (target - natural) / (shrink - from.shrink) : -Infinity;
			if (ratio < -1) continue;
			const badness = 100 * Math.abs(ratio) ** 3;
			if (badness > pass.tolerance) continue;
			const fitness = fitnessOf(ratio);
			let demerits = (LINE_PENALTY + badness) ** 2 + from.demerits;
			if (cost > 0) demerits += cost ** 2;
			else if (cost < 0 && !forced) demerits -= cost ** 2;
			const before = from.item >= 0 ? items[from.item] : null;
			if (before?.kind === 'penalty' && before.flagged) demerits += flagged ? DOUBLE_HYPHEN_DEMERITS : last ? FINAL_HYPHEN_DEMERITS : 0;
			if (Math.abs(fitness - from.fitness) > 1) demerits += ADJACENT_FITNESS_DEMERITS;
			if (demerits < bestDemerits[fitness]) {
				bestDemerits[fitness] = demerits;
				bestFrom[fitness] = from;
			}
		}
		active.length = kept;
		if (bestFrom.every((from) => from === null)) return;
		const totals = totalsAfter(index);
		for (let fitness = 0; fitness < FITNESS_CLASSES; fitness++) {
			const previous = bestFrom[fitness];
			if (previous) active.push({ item: index, fitness, ...totals, demerits: bestDemerits[fitness], previous });
		}
	}

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (i === after) active.push({ item: i, fitness: 1, ...totalsAfter(i), demerits: 0, previous: null });
		if (item.kind === 'box') width += item.width;
		else if (item.kind === 'glue') {
			if (i > after && i > 0 && items[i - 1].kind === 'box') breakAt(i);
			width += item.width;
			stretch += item.stretch;
			shrink += item.shrink;
		} else if (i > after && item.cost < Infinity && (pass.hyphenate || !item.fromPatterns)) breakAt(i);
		if (i >= after && active.length === 0) return null;
	}

	const last = items.length - 1;
	let end: BreakNode | null = null;
	for (const node of active) if (node.item === last && (!end || node.demerits < end.demerits)) end = node;
	if (!end) return null;
	const breaks: number[] = [];
	for (let node: BreakNode | null = end; node && node.item > after; node = node.previous) breaks.push(node.item);
	return breaks.reverse();
}
