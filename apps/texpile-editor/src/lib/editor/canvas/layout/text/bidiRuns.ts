// bidi (D30): UAX #9 levels only for a paragraph holding a strong right-to-left character; lines break in logical
// order, then each line's fragments are reordered by level, and a directional run is drawn as one string
import bidiFactory, { type Bidi } from './bidi/bidiFactory';

const STRONG_RTL = /[\u0590-\u08ff\u200f\u202b\u202e\u2067\ufb1d-\ufdff\ufe70-\ufeff\u{10800}-\u{10fff}\u{1e800}-\u{1efff}]/u;

let bidi: Bidi | null = null;

export type BidiLevelRun = { readonly from: number; readonly to: number; readonly level: number };

/** the fast scan: a Latin paper pays nothing */
export function hasStrongRtl(text: string): boolean {
	return STRONG_RTL.test(text);
}

/** one embedding level per UTF-16 unit, or null when the paragraph is left to right throughout */
export function bidiLevels(text: string, direction: 'ltr' | 'rtl'): Uint8Array | null {
	if (direction === 'ltr' && !hasStrongRtl(text)) return null;
	bidi ??= bidiFactory();
	return bidi.getEmbeddingLevels(text, direction).levels;
}

/** maximal runs of one level inside [from, to); a run of one level is one shaping run */
export function levelRuns(levels: Uint8Array | null, from: number, to: number): BidiLevelRun[] {
	if (!levels) return from < to ? [{ from, to, level: 0 }] : [];
	const runs: BidiLevelRun[] = [];
	let start = from;
	for (let i = from + 1; i <= to; i++) {
		if (i < to && levels[i] === levels[start]) continue;
		runs.push({ from: start, to: i, level: levels[start] });
		start = i;
	}
	return runs;
}

/** rule L2: from the highest level down to the lowest odd one, reverse every sequence at that level or above */
export function visualOrder<T>(items: readonly T[], levelOf: (item: T) => number): T[] {
	const order = [...items];
	const levels = order.map(levelOf);
	const highest = Math.max(0, ...levels);
	const lowestOdd = Math.min(...levels.filter((level) => level % 2 === 1), highest + 1);
	for (let level = highest; level >= lowestOdd; level--) {
		for (let i = 0; i < order.length;) {
			if (levelOf(order[i]) < level) {
				i++;
				continue;
			}
			let end = i;
			while (end < order.length && levelOf(order[end]) >= level) end++;
			order.splice(i, end - i, ...order.slice(i, end).reverse());
			i = end;
		}
	}
	return order;
}
