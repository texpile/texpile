// a comparison's changes shared out among the marks
import type { Node as PMNode } from 'prosemirror-model';
import type { SuggestionMark } from '$lib/comments/activeSuggestions.svelte';
import { bySource, indexStartingBy, pmToSource, sourceToPm, type RegionParse, type Segment } from '../sourceSpans';
import { blockAtPm } from '../sourceMap';
import { isSelfRendered, selfRenderedAround } from '../diff/selfRendered';
import { textOf, type DocChange } from './pmSuggestionDiff';
import { liftPosition } from './liftPosition';
import type { Piece, Side, Span } from './pmSuggestionTypes';

// the byte of a position in a region's document: exact in a run, else the nearest run's edge in the
// innermost block on the side named, else that block's own edge
function regionByte(region: RegionParse, pos: number, assoc: Side): number | null {
	const { leaves } = region.map;
	const exact = pmToSource(leaves, pos, assoc);
	if (exact !== null) return exact;
	const block = blockAtPm(region.map, pos, assoc);
	if (!block) return null;
	const lo = block.pmFrom;
	const hi = block.pmTo;
	const i = indexStartingBy(leaves, 'pmFrom', pos);
	function within(s: Segment | null) {
		return s && s.pmFrom >= lo && s.pmTo <= hi ? s : null;
	}
	const before = within(i >= 0 ? leaves[i] : null);
	const after = within(i + 1 < leaves.length ? leaves[i + 1] : null);
	const pick = assoc < 0 ? (before ?? after) : (after ?? before);
	if (pick) return pick === before ? pick.srcTo : pick.srcFrom;
	// a block with no runs: its start for a position near its start, else its end
	return pos <= block.pmFrom + 1 ? block.srcFrom : block.srcTo;
}

// a change the comparison cut between two open tokens, or two close tokens, is the same change cut at
// the blocks' edges, which is how the reader sees it: a whole paragraph came or went
function slide(doc: PMNode, start: number, end: number): Span {
	let from = start;
	let to = end;
	if (to <= from) return { from, to };
	for (;;) {
		const $from = doc.resolve(from);
		const $to = doc.resolve(to);
		if ($from.depth === 0 || $to.depth === 0 || $from.depth !== $to.depth || $from.parent.type !== $to.parent.type) return { from, to };
		if ($from.parentOffset === 0 && $to.parentOffset === 0) {
			from = $from.before();
			to = $to.before();
			continue;
		}
		if ($from.parentOffset === $from.parent.content.size && $to.parentOffset === $to.parent.content.size) {
			from = $from.after();
			to = $to.after();
			continue;
		}
		return { from, to };
	}
}

/** a mark with its bytes in the stretch before (its words put back) and after (as the file is) */
export type MarkBytes = { mark: SuggestionMark; a: Span; b: Span };

function touches(s: Span, bytes: Span | null): boolean {
	if (!bytes) return false;
	if (bytes.from === bytes.to) return s.from <= bytes.from && bytes.from <= s.to;
	if (s.from === s.to) return bytes.from <= s.from && s.from <= bytes.to;
	return s.from < bytes.to && bytes.from < s.to;
}

function distance(s: Span, at: number): number {
	return at < s.from ? s.from - at : at > s.to ? at - s.to : 0;
}

// the position of a byte in a region's document: exact in a run, else the nearest run's edge in the
// block, else the block's own edge
function regionPos(region: RegionParse, byte: number, assoc: Side): number | null {
	const { leaves, blocks } = region.map;
	const exact = sourceToPm(leaves, byte, assoc);
	if (exact !== null) return exact;
	const sorted = bySource(leaves);
	const block = blocks.find((b) => b.srcFrom <= byte && byte <= b.srcTo) ?? null;
	const i = indexStartingBy(sorted, 'srcFrom', byte);
	function within(s: Segment | null) {
		return s && block && s.srcFrom >= block.srcFrom && s.srcTo <= block.srcTo ? s : null;
	}
	const before = within(i >= 0 ? sorted[i] : null);
	const after = within(i + 1 < sorted.length ? sorted[i + 1] : null);
	const pick = assoc < 0 ? (before ?? after) : (after ?? before);
	if (pick) return pick === before ? pick.pmTo : pick.pmFrom;
	if (!block) return null;
	return byte <= block.srcFrom ? block.pmFrom : byte >= block.srcTo ? block.pmTo : Math.min(block.pmFrom + 1, block.pmTo);
}

// the positions a mark's bytes can take in a region's document, read from either side of each end
function spanOf(region: RegionParse, bytes: Span): Span | null {
	const ends = [bytes.from, bytes.to].flatMap((byte) => [regionPos(region, byte, -1), regionPos(region, byte, 1)]);
	if (ends.some((pos) => pos === null)) return null;
	return { from: Math.min(...(ends as number[])), to: Math.max(...(ends as number[])) };
}

// the stretch each mark has in the two documents: the words between marks are the same bytes on both
// sides, and are compared as such, so a word typed before one starting with its letter is not read as
// that letter moved
export function stretchesOf(marks: MarkBytes[], before: RegionParse, after: RegionParse): DocChange[] {
	const out: DocChange[] = [];
	for (const m of marks) {
		const a = spanOf(before, m.a);
		const b = spanOf(after, m.b);
		if (!a || !b) return [];
		out.push({ fromA: a.from, toA: a.to, fromB: b.from, toB: b.to });
	}
	return out;
}

function bytesOf(region: RegionParse, span: Span): Span | null {
	const point = span.to === span.from;
	const from = regionByte(region, span.from, point ? -1 : 1);
	const to = point ? from : regionByte(region, span.to, -1);
	return from === null || to === null ? null : { from, to: Math.max(from, to) };
}

// a change shared out among the marks whose bytes it lies in, cut where the next mark's bytes begin:
// two words taken out at one spot by two people are two changes, not one
type Stretch = { fromA: number; toA: number; fromB: number; toB: number; joined?: boolean };

// words the comparison matched, but that the reader sees in another kind of place: in prose on one
// side and inside a node that draws itself (a figure's caption) on the other. The comparison reads
// only the node's tokens as changed, so the words would draw as untouched while the block they
// came from vanished; the changes on either side are read as one that takes the words in
function movedIntoNode(before: RegionParse, aFrom: number, aTo: number, after: RegionParse, bFrom: number, bTo: number): boolean {
	if (aTo <= aFrom || bTo <= bFrom || textOf(before.doc, aFrom, aTo).trim() === '') return false;
	return (selfRenderedAround(before.doc, aFrom, aTo) !== null) !== (selfRenderedAround(after.doc, bFrom, bTo) !== null);
}

// the first edge of a node that draws itself which a range crosses: the node's start when the
// range takes the node in after words of its own, its end when the range leaves the node (or ends
// with it, while the other side goes on past it)
function crossedEdge(doc: PMNode, from: number, to: number): { pos: number; side: 'start' | 'end' } | null {
	let found: { pos: number; side: 'start' | 'end' } | null = null;
	doc.nodesBetween(from, to, (node, pos) => {
		if (found || node.isLeaf || node.isText || !isSelfRendered(node)) return !found;
		const end = pos + node.nodeSize;
		if (pos > from && pos < to) found = { pos, side: 'start' };
		else if (pos < from && end > from && end <= to) found = { pos: end, side: 'end' };
		return false;
	});
	return found;
}

// a change that runs from words into a node that draws itself (or out of one) is two: the words,
// and the node, which is then set beside the node it was rather than struck as a block with them
export function splitAtNodes(changes: DocChange[], before: RegionParse, after: RegionParse): Stretch[] {
	const out: Stretch[] = [];
	for (const c of changes) {
		let cur: Stretch = { fromA: c.fromA, toA: c.toA, fromB: c.fromB, toB: c.toB };
		for (;;) {
			const a = crossedEdge(before.doc, cur.fromA, cur.toA);
			const b = crossedEdge(after.doc, cur.fromB, cur.toB);
			if (!a || !b || a.side !== b.side || (a.pos === cur.toA && b.pos === cur.toB)) break;
			out.push({ fromA: cur.fromA, toA: a.pos, fromB: cur.fromB, toB: b.pos });
			cur = { fromA: a.pos, toA: cur.toA, fromB: b.pos, toB: cur.toB };
		}
		out.push(cur);
	}
	return out;
}

export function joinAcrossNodes(changes: Stretch[], before: RegionParse, after: RegionParse): Stretch[] {
	const out: Stretch[] = [];
	for (const c of changes) {
		const prev = out[out.length - 1];
		if (prev && movedIntoNode(before, prev.toA, c.fromA, after, prev.toB, c.fromB)) {
			prev.toA = c.toA;
			prev.toB = c.toB;
			prev.joined = true;
		} else out.push({ fromA: c.fromA, toA: c.toA, fromB: c.fromB, toB: c.toB });
	}
	return out;
}

export function shareOut(
	c: Stretch,
	before: RegionParse,
	after: RegionParse,
	marks: MarkBytes[]
): { mark: SuggestionMark; piece: Piece }[] {
	const A = slide(before.doc, c.fromA, c.toA);
	let B = slide(after.doc, c.fromB, c.toB);
	// the place a slid change took its blocks from, lifted to the level they were taken from, so a list
	// item taken out stands between items and not in the one after it
	if (B.to === B.from && A.to > A.from) {
		const at = liftPosition(after.doc, B.from, before.doc.resolve(A.from).depth);
		B = { from: at, to: at };
	}
	const aBytes = bytesOf(before, A);
	const bBytes = bytesOf(after, B);
	let involved = marks.filter((m) => touches(m.a, aBytes) || touches(m.b, bBytes));
	if (involved.length === 0) {
		const at = bBytes?.from ?? aBytes?.from ?? 0;
		involved = [marks.reduce((best, m) => (distance(m.b, at) < distance(best.b, at) ? m : best))];
	}
	// a change read as one across a node is drawn whole, by the first of its marks; the others
	// ride with it
	if (involved.length === 1 || c.joined) return [{ mark: involved[0].mark, piece: { A, B } }];
	function clamp(pos: number | null, lo: number, hi: number) {
		return Math.min(hi, Math.max(lo, pos ?? lo));
	}
	// a cut inside a chip goes after it: the chip is struck whole, with the mark it began in
	function outsideChip(doc: PMNode, pos: number | null) {
		const around = pos === null ? null : selfRenderedAround(doc, pos);
		return around && doc.nodeAt(around.from)?.isInline ? around.to : pos;
	}
	const out: { mark: SuggestionMark; piece: Piece }[] = [];
	let prevA = A.from;
	let prevB = B.from;
	for (let i = 1; i < involved.length; i++) {
		const cutA = clamp(outsideChip(before.doc, regionPos(before, involved[i].a.from, 1)), prevA, A.to);
		const cutB = clamp(outsideChip(after.doc, regionPos(after, involved[i].b.from, 1)), prevB, B.to);
		out.push({ mark: involved[i - 1].mark, piece: { A: { from: prevA, to: cutA }, B: { from: prevB, to: cutB } } });
		prevA = cutA;
		prevB = cutB;
	}
	out.push({ mark: involved[involved.length - 1].mark, piece: { A: { from: prevA, to: A.to }, B: { from: prevB, to: B.to } } });
	return out;
}
