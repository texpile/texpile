// a parsed stretch's positions in the editor's document
import type { Node as PMNode, ResolvedPos } from 'prosemirror-model';
import { bySource, indexStartingBy, pmToSource, sourceToPm, type RegionParse, type Segment, type SourceMap } from '../sourceSpans';
import { blockAtSource } from '../sourceMap';
import { isSelfRendered } from '../diff/selfRendered';
import type { Shown, Side } from './pmSuggestionTypes';

// the block a position of a region's document is in; at a boundary two blocks share, the side names it
function blockOnSide(blocks: Segment[], pos: number, assoc: Side): Segment | null {
	const i = indexStartingBy(blocks, 'pmFrom', pos);
	const at = i >= 0 ? blocks[i] : null;
	if (assoc < 0 && at && at.pmFrom === pos && i > 0 && blocks[i - 1].pmTo === pos) return blocks[i - 1];
	return at && pos <= at.pmTo ? at : null;
}

type Landing = { pos: number; block: Segment | null };

// a position at the very start of an inline node's content, reached from the byte before the node,
// is the node's own start, and one at the end of its content is past the node from either side (a
// change that begins there begins after it). The node's opening and closing have no bytes of their
// own, and the runs inside it start one position in
export function atNodeEdge(doc: PMNode, pos: number, assoc: Side): number {
	const $pos = doc.resolve(pos);
	if ($pos.depth === 0 || !$pos.parent.isInline || $pos.parent.isText) return pos;
	if (assoc > 0 && $pos.parentOffset === 0) return $pos.before();
	if ($pos.parentOffset === $pos.parent.content.size) return $pos.after();
	return pos;
}

// the editor position of a byte: exact in a run, the nearest run's edge in the same block, or the
// block itself when it has no runs
function land(map: SourceMap, offset: number, assoc: Side): Landing | null {
	const exact = sourceToPm(map.leaves, offset, assoc);
	if (exact !== null) return { pos: exact, block: null };
	const block = blockAtSource(map, offset);
	const sorted = bySource(map.leaves);
	const i = indexStartingBy(sorted, 'srcFrom', offset);
	function within(s: Segment | null) {
		return s && block && s.srcFrom >= block.srcFrom && s.srcTo <= block.srcTo ? s : null;
	}
	const before = within(i >= 0 ? sorted[i] : null);
	const after = within(i + 1 < sorted.length ? sorted[i + 1] : null);
	const pick = assoc < 0 ? (before ?? after) : (after ?? before);
	if (pick) return { pos: pick === before ? pick.pmTo : pick.pmFrom, block: null };
	return block ? { pos: block.pmFrom, block } : null;
}

// the editor can hold whitespace at a textblock's edge that the file does not (a paragraph split after a
// space), so the edge of a textblock in the stretch is the edge in the editor, past that whitespace
function pastUnwritten(doc: PMNode, l: Landing, $pos: ResolvedPos): Landing {
	const atStart = $pos.parentOffset === 0;
	const atEnd = $pos.parentOffset === $pos.parent.content.size;
	if (!$pos.parent.isTextblock || atStart === atEnd) return l;
	// at a chip's edge the bytes land inside it, and the textblock's edge is past the chip
	const pos = atNodeEdge(doc, l.pos, atStart ? 1 : -1);
	const $l = doc.resolve(pos);
	if (!$l.parent.isTextblock) return l;
	const edge = atEnd ? $l.end() : $l.start();
	const between = doc.textBetween(Math.min(edge, pos), Math.max(edge, pos), '\n', '￼');
	return between !== '' && between.trim() === '' ? { pos: edge, block: null } : l;
}

// where the stretch's document has `pos`, the editor's document has it too: found by the bytes of the
// run there, else of the nearest run in the same textblock, else by its place in the block, which the
// two documents share
export function landIn(shown: Shown, region: RegionParse, pos: number, assoc: Side): Landing | null {
	const { leaves, blocks } = region.map;
	// inside a node that draws itself, the position stays inside: the node's bytes are one run, so
	// its start is found and the position put just past it
	const $pos = region.doc.resolve(pos);
	for (let d = $pos.depth; d > 0; d--) {
		const node = $pos.node(d);
		if (node.isLeaf || !isSelfRendered(node)) continue;
		const byte = pmToSource(leaves, $pos.before(d), 1);
		const start = byte === null ? null : sourceToPm(shown.map.leaves, shown.at + byte, 1);
		if (start === null) break;
		const own = shown.doc.nodeAt(start);
		return { pos: own && own.type === node.type ? start + 1 : start, block: null };
	}
	const exact = pmToSource(leaves, pos, assoc);
	if (exact !== null) {
		const l = land(shown.map, shown.at + exact, assoc);
		if (l && !l.block) return pastUnwritten(shown.doc, l, $pos);
	}
	if ($pos.parent.isTextblock) {
		const lo = $pos.start();
		const hi = $pos.end();
		const i = indexStartingBy(leaves, 'pmFrom', pos);
		function within(s: Segment | null) {
			return s && s.pmFrom >= lo && s.pmTo <= hi ? s : null;
		}
		const before = within(i >= 0 ? leaves[i] : null);
		const after = within(i + 1 < leaves.length ? leaves[i + 1] : null);
		const pick = assoc < 0 ? (before ?? after) : (after ?? before);
		if (pick) {
			const l = land(shown.map, shown.at + (pick === before ? pick.srcTo : pick.srcFrom), pick === before ? -1 : 1);
			if (l && !l.block) return pastUnwritten(shown.doc, l, $pos);
		}
	}
	if (!blockOnSide(blocks, pos, assoc)) return null;
	// the stretch's top-level nodes are the shown ones in `tops`, so the same path down, the same offset
	// in the innermost node
	const index = $pos.index(0);
	const last = shown.tops[shown.tops.length - 1];
	if (last === undefined) return null;
	const top = index < shown.tops.length ? shown.tops[index] : last + 1;
	if ($pos.depth === 0) return top > shown.doc.childCount ? null : { pos: shown.doc.resolve(0).posAtIndex(top), block: null };
	if (top >= shown.doc.childCount) return null;
	let node = shown.doc.child(top);
	let start = shown.doc.resolve(0).posAtIndex(top);
	for (let d = 1; d < $pos.depth; d++) {
		const index = $pos.index(d);
		if (index >= node.childCount) return { pos: start + node.nodeSize - 1, block: null };
		let offset = 1;
		for (let k = 0; k < index; k++) offset += node.child(k).nodeSize;
		start += offset;
		node = node.child(index);
	}
	return { pos: start + 1 + Math.min($pos.parentOffset, node.content.size), block: null };
}
