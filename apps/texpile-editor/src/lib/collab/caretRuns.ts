// the caret block's runs once a patch kept it as typed: the parse reads a typed space beside another as
// one, and the block written against the parse's runs gained a space
import type { Segment, SourceMap } from '$lib/editor/visual/sourceSpans';

/** a stretch of the caret block taken from the parse: `a`..`b` in the live doc, `c`..`d` in the parse */
export type ParseStretch = { a: number; b: number; c: number; d: number };
/** a change from the old text to the new inside the caret block */
export type BlockChange = { oldIndex: number; remove: number; insert: string };

type Piece = [pmFrom: number, pmTo: number, srcFrom: number, srcTo: number];

/** its own runs where it kept its characters, the parse's where it took the parse's, counted from the
 *  block's start; null when a stretch cuts a run that stands in for several characters */
export function carriedRuns(
	blockFrom: number,
	blockTo: number,
	oldMap: SourceMap,
	parsedFrom: number,
	parsedTo: number,
	newMap: SourceMap,
	stretches: readonly ParseStretch[],
	changes: readonly BlockChange[],
	moved: number
): Segment[] | null {
	const growth = stretches.map((s) => s.d - s.c - (s.b - s.a));
	function keptPm(p: number): number {
		let at = p - blockFrom;
		for (let k = 0; k < stretches.length; k++) if (stretches[k].b <= p) at += growth[k];
		return at;
	}
	function keptSrc(q: number): number {
		let at = q + moved;
		for (const c of changes) if (c.oldIndex + c.remove <= q) at += c.insert.length - c.remove;
		return at;
	}
	const out: Segment[] = [];
	for (const l of oldMap.leaves) {
		if (l.pmFrom <= blockFrom || l.pmTo >= blockTo) continue;
		for (const [pf, pt, sf, st] of piecesOf(l)) {
			const cut = stretches.filter((s) => pf < s.b && pt > s.a);
			if (cut.some((s) => pf < s.a || pt > s.b)) return null;
			if (cut.length) continue;
			if (changes.some((c) => sf < c.oldIndex + c.remove && st > c.oldIndex)) return null;
			const pm = keptPm(pf);
			const src = keptSrc(sf);
			out.push({ pmFrom: pm, pmTo: pm + pt - pf, srcFrom: src, srcTo: src + st - sf, kind: l.kind });
		}
	}
	let grown = 0;
	for (let k = 0; k < stretches.length; k++) {
		const s = stretches[k];
		const start = s.a - blockFrom + grown;
		grown += growth[k];
		for (const l of newMap.leaves) {
			if (l.pmTo <= s.c || l.pmFrom >= s.d) continue;
			for (const [pf, pt, sf, st] of piecesOf(l)) {
				if (pt <= s.c || pf >= s.d) continue;
				if (pf < s.c || pt > s.d) return null;
				out.push({ pmFrom: start + pf - s.c, pmTo: start + pt - s.c, srcFrom: sf, srcTo: st, kind: l.kind });
			}
		}
	}
	const filled = fillParseRuns(
		out,
		newMap.leaves.filter((l) => l.pmFrom > parsedFrom && l.pmTo < parsedTo)
	);
	if (!filled) return null;
	filled.sort((x, y) => x.pmFrom - y.pmFrom);
	const runs: Segment[] = [];
	for (const s of filled) {
		const last = runs.at(-1);
		if (last && last.kind === 'text' && s.kind === 'text' && last.pmTo === s.pmFrom && last.srcTo === s.srcFrom) {
			last.pmTo = s.pmTo;
			last.srcTo = s.srcTo;
		} else runs.push(s);
	}
	return runs;
}

// a parse run whose bytes the carried runs place only in part (a typed space beside a space they kept,
// read by the parse as one) stands for the characters that do place them
function fillParseRuns(runs: Segment[], parseRuns: Segment[]): Segment[] | null {
	let out = runs;
	for (const r of parseRuns) {
		const inside = out.filter((s) => s.srcTo > r.srcFrom && s.srcFrom < r.srcTo);
		let bytes = 0;
		for (const s of inside) bytes += Math.min(s.srcTo, r.srcTo) - Math.max(s.srcFrom, r.srcFrom);
		if (bytes === r.srcTo - r.srcFrom) continue;
		if (!inside.length || inside.some((s) => s.srcFrom < r.srcFrom || s.srcTo > r.srcTo)) return null;
		const pmFrom = Math.min(...inside.map((s) => s.pmFrom));
		const pmTo = Math.max(...inside.map((s) => s.pmTo));
		if (inside.reduce((n, s) => n + s.pmTo - s.pmFrom, 0) !== pmTo - pmFrom) return null;
		out = [...out.filter((s) => !inside.includes(s)), { pmFrom, pmTo, srcFrom: r.srcFrom, srcTo: r.srcTo, kind: 'sub' }];
	}
	return out;
}

// a text run one character at a time, so a stretch can cut it anywhere; any other run whole
function piecesOf(l: Segment): Piece[] {
	if (l.kind !== 'text' || l.pmTo - l.pmFrom !== l.srcTo - l.srcFrom) return [[l.pmFrom, l.pmTo, l.srcFrom, l.srcTo]];
	const out: Piece[] = [];
	for (let i = 0; i < l.pmTo - l.pmFrom; i++) out.push([l.pmFrom + i, l.pmFrom + i + 1, l.srcFrom + i, l.srcFrom + i + 1]);
	return out;
}
