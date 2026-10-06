// Caret positions across the boundary, as lookups in the document's source map: exact inside a
// run; at markup, the edge of the nearest run in the same block; in a block with no runs, the block
import { bySource, indexStartingBy, pmToSource, sourceToPm, type Segment, type SourceMap } from './sourceSpans';

type Side = -1 | 1;

/** the top-level block a document position is in */
export function topBlockAtPm(map: SourceMap, pos: number): Segment | null {
	const i = indexStartingBy(map.blocks, 'pmFrom', pos);
	const b = i >= 0 ? map.blocks[i] : null;
	return b && pos <= b.pmTo ? b : null;
}

/** the top-level block a file offset is in */
export function topBlockAtSource(map: SourceMap, offset: number): Segment | null {
	const i = indexStartingBy(map.blocks, 'srcFrom', offset);
	const b = i >= 0 ? map.blocks[i] : null;
	return b && offset <= b.srcTo ? b : null;
}

/** the innermost block a document position is in: the tightest of the ranges below the top level
 *  that hold it, else the top-level block. At a boundary two sibling blocks share, `assoc` names
 *  the side: the block ending there for -1, the one starting there for 1 */
export function blockAtPm(map: SourceMap, pos: number, assoc: Side = 1): Segment | null {
	const top = topBlockAtPm(map, pos);
	if (!top) return null;
	const inner = map.inner ?? [];
	let best: Segment | null = null;
	function better(s: Segment) {
		if (!best) return true;
		const a = s.pmTo - s.pmFrom;
		const b = best.pmTo - best.pmFrom;
		if (a !== b) return a < b;
		return assoc < 0 ? s.pmTo === pos && best.pmFrom === pos : s.pmFrom === pos && best.pmTo === pos;
	}
	for (let i = indexStartingBy(inner, 'pmFrom', pos); i >= 0 && inner[i].pmFrom >= top.pmFrom; i--) {
		const s = inner[i];
		if (pos <= s.pmTo && better(s)) best = s;
	}
	return best ?? top;
}

/** the innermost block a file offset is in, else the top-level block */
export function blockAtSource(map: SourceMap, offset: number, assoc: Side = 1): Segment | null {
	const top = topBlockAtSource(map, offset);
	if (!top) return null;
	const inner = bySource(map.inner ?? []);
	let best: Segment | null = null;
	function better(s: Segment) {
		if (!best) return true;
		const a = s.srcTo - s.srcFrom;
		const b = best.srcTo - best.srcFrom;
		if (a !== b) return a < b;
		return assoc < 0 ? s.srcTo === offset && best.srcFrom === offset : s.srcFrom === offset && best.srcTo === offset;
	}
	for (let i = indexStartingBy(inner, 'srcFrom', offset); i >= 0 && inner[i].srcFrom >= top.srcFrom; i--) {
		const s = inner[i];
		if (offset <= s.srcTo && better(s)) best = s;
	}
	return best ?? top;
}

/** the last block starting at or before a file offset, for a viewport that has to land somewhere */
export function blockAtOrBefore(map: SourceMap, offset: number): Segment | null {
	const i = indexStartingBy(map.blocks, 'srcFrom', offset);
	return i >= 0 ? map.blocks[i] : (map.blocks[0] ?? null);
}

function around(list: Segment[], key: 'pmFrom' | 'srcFrom', at: number): { before: Segment | null; after: Segment | null } {
	const i = indexStartingBy(list, key, at);
	return { before: i >= 0 ? list[i] : null, after: i + 1 < list.length ? list[i + 1] : null };
}

/** the file offset of a document position, or null for a document with no map at all */
export function offsetAtPm(map: SourceMap, pos: number, assoc: Side = -1): number | null {
	const exact = pmToSource(map.leaves, pos, assoc);
	if (exact !== null) return exact;
	const block = blockAtPm(map, pos, assoc);
	const { before, after } = around(map.leaves, 'pmFrom', pos);
	function within(s: Segment | null) {
		return s && (!block || (s.pmFrom >= block.pmFrom && s.pmTo <= block.pmTo)) ? s : null;
	}
	const b = within(before);
	const a = within(after);
	const pick = assoc < 0 ? (b ?? a) : (a ?? b);
	if (pick) return pick === b ? pick.srcTo : pick.srcFrom;
	return block ? block.srcFrom : null;
}

/** the document position of a file offset, or null for a document with no map at all */
export function pmAtOffset(map: SourceMap, offset: number, assoc: Side = 1): number | null {
	const exact = sourceToPm(map.leaves, offset, assoc);
	if (exact !== null) return exact;
	const block = blockAtSource(map, offset, assoc);
	const { before, after } = around(bySource(map.leaves), 'srcFrom', offset);
	function within(s: Segment | null) {
		return s && (!block || (s.srcFrom >= block.srcFrom && s.srcTo <= block.srcTo)) ? s : null;
	}
	const b = within(before);
	const a = within(after);
	const pick = assoc < 0 ? (b ?? a) : (a ?? b);
	if (pick) return pick === b ? pick.pmTo : pick.pmFrom;
	return block ? Math.min(block.pmFrom + 1, block.pmTo) : null;
}

/** a caret's document position: after spaces typed at the end of a line it stays with that line, which the
 *  document holds without them, rather than jumping to the next block */
export function caretAtOffset(map: SourceMap, source: string, offset: number): number | null {
	return pmAtOffset(map, offset, /\S[ \t]+$/.test(source.slice(Math.max(0, offset - 64), offset)) ? -1 : 1);
}
