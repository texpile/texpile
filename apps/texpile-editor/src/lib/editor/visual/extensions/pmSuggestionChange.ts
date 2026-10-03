// what one mark's share of a change draws
import type { Node as PMNode } from 'prosemirror-model';
import type { SuggestionMark } from '$lib/comments/activeSuggestions.svelte';
import type { RegionParse, SourceMap } from '../sourceSpans';
import { blockAtPm } from '../sourceMap';
import { isSelfRendered, selfRenderedAround } from '../diff/selfRendered';
import { textOf } from './pmSuggestionDiff';
import { atNodeEdge, landIn } from './pmSuggestionLanding';
import { oldContent } from './pmSuggestionOldContent';
import type { OldRun, Piece, PmSuggestionRange, Shown, Side, Span } from './pmSuggestionTypes';

function textblocksOpening(doc: PMNode, from: number, to: number): number {
	let n = 0;
	doc.nodesBetween(from, to, (node, pos) => {
		if (!node.isTextblock) return true;
		if (pos >= from && pos < to) n++;
		return false;
	});
	return n;
}

// the textblock starting at or after `pos` (dir 1), or ending at or before it (dir -1)
function textblockBeside(doc: PMNode, pos: number, dir: Side): number | null {
	let found: number | null = null;
	const [lo, hi] = dir > 0 ? [pos, doc.content.size] : [0, pos];
	doc.nodesBetween(lo, hi, (node, p) => {
		if (dir > 0 && found !== null) return false;
		if (!node.isTextblock) return true;
		if (dir > 0 ? p >= pos : p + node.nodeSize <= pos) found = p;
		return false;
	});
	return found;
}

// a change of nesting alone: the item beside it whose block sits at another depth than it did
// eslint-disable-next-line @typescript-eslint/naming-convention -- A and B are the comparison's old and new sides, as in Piece
function movedItem(doc: PMNode, from: number, to: number, a: PMNode, A: Span, b: PMNode, B: Span): Span | null {
	for (const dir of [1, -1] as Side[]) {
		const was = textblockBeside(a, dir > 0 ? A.to : A.from, dir);
		const now = textblockBeside(b, dir > 0 ? B.to : B.from, dir);
		if (was === null || now === null || a.resolve(was).depth === b.resolve(now).depth) continue;
		const at = textblockBeside(doc, dir > 0 ? to : from, dir);
		if (at === null) continue;
		const $at = doc.resolve(at);
		return $at.depth > 0 ? { from: $at.before(), to: $at.after() } : { from: at, to: at + doc.nodeAt(at)!.nodeSize };
	}
	return null;
}

// a block that became another kind: the top-level block the change is in, or the one after it
function kindChanged(doc: PMNode, from: number, to: number): Span {
	const $from = doc.resolve(from);
	const at = $from.depth > 0 ? $from.before(1) : from;
	const node = doc.nodeAt(at);
	return node ? { from: at, to: at + node.nodeSize } : { from, to };
}

function blocksSpanning(map: SourceMap, from: number, to: number): Span | null {
	const a = blockAtPm(map, from);
	const b = blockAtPm(map, to) ?? a;
	if (!a && !b) return null;
	return { from: Math.min((a ?? b)!.pmFrom, (b ?? a)!.pmFrom), to: Math.max((a ?? b)!.pmTo, (b ?? a)!.pmTo) };
}

type Placement = { ranges: PmSuggestionRange[]; partial: boolean } | null;

export function placeChange(
	doc: PMNode,
	s: SuggestionMark,
	piece: Piece,
	before: RegionParse,
	after: RegionParse,
	shown: Shown
): Placement {
	const { A, B } = piece;
	const base = { id: s.id, restore: s.restore, mine: s.mine, old: [] as OldRun[], partial: false };
	const map = shown.map;
	const lenA = A.to - A.from;
	const lenB = B.to - B.from;
	const point = lenB === 0;
	const a = landIn(shown, after, B.from, point ? -1 : 1);
	const b = point ? a : landIn(shown, after, B.to, -1);
	if (!a || !b) return null;
	const size = doc.content.size;
	const edgeA = a.block ? a.pos : atNodeEdge(doc, Math.min(a.pos, size), point ? -1 : 1);
	const edgeB = b.block ? b.pos : atNodeEdge(doc, Math.min(b.pos, size), -1);
	const from = Math.min(edgeA, edgeB, size);
	const to = Math.min(Math.max(edgeA, edgeB), size);
	if (a.block || b.block) {
		const blocks = blocksSpanning(map, from, to);
		return blocks ? { ranges: [{ ...base, ...blocks, partial: true }], partial: true } : null;
	}
	const newText = textOf(after.doc, B.from, B.to);
	const oldText = textOf(before.doc, A.from, A.to);
	// inside a node that draws itself, or a change to what such a node is (its source, say) that
	// the comparison reads as its opening token. A leaf (a line break, a label) is drawn by the
	// editor like a character and takes the tint the words do, and words taken out just before
	// such a node are only words
	const atStart = to > from ? doc.nodeAt(from) : null;
	const chip =
		selfRenderedAround(doc, from, to) ??
		(atStart && !atStart.isLeaf && isSelfRendered(atStart) && to <= from + atStart.nodeSize ? { from, to: from + atStart.nodeSize } : null);
	if (chip) {
		// a node the change begins inside stood before it and was changed by it; one whose opening is
		// in the change is new, or stands in place of what the change took out
		const around = selfRenderedAround(after.doc, B.from);
		const stood = around !== null;
		// the one it began inside, even when the change runs on past its end (a caption that took in
		// the heading after it)
		const inside = stood ? selfRenderedAround(before.doc, A.from) : null;
		const found = inside ? before.doc.nodeAt(inside.from) : !stood && lenA > 0 ? before.doc.nodeAt(A.from) : null;
		const was = found && !found.isLeaf && isSelfRendered(found) ? found : null;
		// what the node replaced, when that was not such a node itself: words, or whole blocks
		const old = was ? { runs: [], gone: null } : oldContent(before.doc, A.from, A.to);
		const ranges: PmSuggestionRange[] = [];
		// a change at the closing of the node that stood took out what stood after it
		const goneAt = around && B.from === around.to - 1 ? chip.to : chip.from;
		if (old.gone) ranges.push({ ...base, from: goneAt, to: goneAt, gone: old.gone });
		ranges.push({ ...base, ...chip, node: true, old: old.runs, ...(was ? { was } : {}) });
		// what stood after the node it was and is in the change too (the paragraph a figure took
		// in as its caption): struck after the node, where it stood
		const wasEnd = was ? (inside?.to ?? A.from + was.nodeSize) : 0;
		const beyond = was && wasEnd < A.to ? oldContent(before.doc, wasEnd, A.to) : null;
		if (beyond?.gone) ranges.push({ ...base, from: chip.to, to: chip.to, gone: beyond.gone });
		else if (beyond?.runs.length) ranges.push({ ...base, from: chip.to, to: chip.to, old: beyond.runs });
		return { ranges, partial: false };
	}
	// block boundaries moved and no words did: a break came or went, or a block became another kind
	const boundsA = lenA - oldText.length;
	const boundsB = lenB - newText.length;
	if (newText.trim() === '' && oldText.trim() === '' && (boundsA !== boundsB || lenA + lenB === boundsA + boundsB)) {
		// a break is one textblock more or fewer; the same count in other wrappers is an item moved a level
		const blocksA = textblocksOpening(before.doc, A.from, A.to);
		const blocksB = textblocksOpening(after.doc, B.from, B.to);
		// the space a break replaced is struck beside the mark, and one that replaced a break is tinted
		if (blocksB > blocksA)
			return { ranges: [{ ...base, from, to: from, brk: 'added', old: oldContent(before.doc, A.from, A.to).runs }], partial: false };
		if (blocksA > blocksB) return { ranges: [{ ...base, from, to, brk: 'removed' }], partial: false };
		const block = movedItem(doc, from, to, before.doc, A, after.doc, B) ?? kindChanged(doc, from, to);
		return { ranges: [{ ...base, ...block, node: true, format: true }], partial: false };
	}
	const old = oldContent(before.doc, A.from, A.to);
	const ranges: PmSuggestionRange[] = [];
	if (old.gone) {
		// whole blocks taken out at a block's edge stand at the join between blocks; taken out of the
		// middle of one, or with the end or start of a block among them, they stand where the text broke
		const $from = doc.resolve(from);
		const mid = $from.parent.isTextblock && $from.parentOffset > 0 && $from.parentOffset < $from.parent.content.size;
		const inline = mid || old.gone.head.length > 0 || old.gone.tail.length > 0;
		// between blocks at any depth the position is the join itself; inside a textblock, the join
		// is that block's own edge, so a block taken out of an item stands in the item
		const edge =
			inline || !$from.parent.isTextblock || $from.depth === 0 ? from : $from.parentOffset === 0 ? $from.before() : $from.after();
		// words cut from the start of the block after a join, with nothing of the block before it, stood in that block
		const into = !$from.parent.isTextblock && !old.gone.head.length && old.gone.tail.length ? textblockBeside(doc, from, 1) : null;
		const at = into === null ? edge : into + 1;
		ranges.push({ ...base, from: at, to: at, gone: old.gone });
	}
	if (newText !== '' || old.runs.length) {
		const format = newText !== '' && newText === oldText;
		ranges.push({ ...base, from, to, old: old.runs, ...(format ? { format } : {}) });
	}
	return { ranges, partial: false };
}
