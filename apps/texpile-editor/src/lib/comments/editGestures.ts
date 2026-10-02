// where the edits since the last comparison landed
import { commonEnds, textHunks } from './suggestHunks';

export type TextSpan = { from: number; to: number };

const MAX_GESTURE = 200;

export function carryGestures(spans: TextSpan[], before: string, after: string): TextSpan[] {
	if (before === after) return spans;
	const { start: p, end: s } = commonEnds(before, after);
	const removedEnd = before.length - s;
	const insertedEnd = after.length - s;
	const delta = after.length - before.length;
	let from = p;
	if (removedEnd === p || insertedEnd === p) {
		const text = removedEnd === p ? after : before;
		const end = removedEnd === p ? insertedEnd : removedEnd;
		while (from > 0 && text.charCodeAt(from - 1) === text.charCodeAt(end - 1 - (p - from))) from--;
	}
	const grown = { from, to: insertedEnd };
	const out: TextSpan[] = [];
	for (const g of spans) {
		if (g.to < from) out.push(g);
		else if (g.from > removedEnd) out.push({ from: g.from + delta, to: g.to + delta });
		else {
			grown.from = Math.min(grown.from, g.from);
			grown.to = Math.max(grown.to, g.to + delta);
		}
	}
	// a wrapper put round a long passage (bold, a heading) changes a few bytes at each end of it
	function wrapper() {
		const hunks = textHunks(before.slice(p, removedEnd), after.slice(p, insertedEnd));
		return hunks.length <= 2 && hunks.reduce((n, h) => n + (h.aTo - h.aFrom) + (h.bTo - h.bFrom), 0) <= MAX_GESTURE;
	}
	if (insertedEnd - p <= MAX_GESTURE || wrapper()) out.push(grown);
	return out.sort((a, b) => a.from - b.from);
}
