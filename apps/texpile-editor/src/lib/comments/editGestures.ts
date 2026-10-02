// where the edits since the last comparison landed
import { commonEnds, textHunks } from './suggestHunks';

export type TextSpan = { from: number; to: number };

/** one place an edit changed, in the text before it (A) and after it (B) */
export type TextChange = { fromA: number; toA: number; fromB: number; toB: number };

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

/** `spans` carried through an edit made in several places at once (several cursors, a replace all): one gesture per place */
export function carryGesturesThrough(spans: TextSpan[], changes: TextChange[]): TextSpan[] {
	const grown: (TextSpan | null)[] = changes.map((c) => (c.toB - c.fromB <= MAX_GESTURE ? { from: c.fromB, to: c.toB } : null));
	const out: TextSpan[] = [];
	for (const g of spans) {
		let delta = 0;
		let joined = false;
		for (const [i, c] of changes.entries()) {
			if (g.to < c.fromA) break;
			const after = c.toB - c.toA;
			if (g.from > c.toA) {
				delta = after;
				continue;
			}
			const span = grown[i];
			if (span) grown[i] = { from: Math.min(span.from, g.from + delta), to: Math.max(span.to, g.to + after) };
			joined = true;
		}
		if (!joined) out.push({ from: g.from + delta, to: g.to + delta });
	}
	for (const span of grown) if (span) out.push(span);
	out.sort((a, b) => a.from - b.from);
	const merged: TextSpan[] = [];
	for (const span of out) {
		const last = merged[merged.length - 1];
		if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
		else merged.push({ ...span });
	}
	return merged;
}
