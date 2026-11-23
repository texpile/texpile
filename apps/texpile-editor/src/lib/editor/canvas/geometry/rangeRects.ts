// a range's rects: per line its fragments' pieces over the line box (reach line) or the strut (reach text) (6.4, 9.3)
import type { DocRect, LineBox, LineFragment } from '../contracts/layoutTypes';
import type { DocumentModel } from '../contracts/engineTypes';
import { caretRectAt, caretSpotOf, type GeometryTools } from './caretRects';
import { blockOnModel, hasPositions, lineEnd, type BlockOnModel, type PlacedBox, type PlacedTextblock } from './lineIndex';
import { textX } from './positionMap';

type Span = { left: number; right: number };
/** offsets from the block's start; atoms: an inline atom's piece of a line counts (the selection shades atoms by their box) */
export type RangeQuery = { from: number; to: number; reach: 'line' | 'text'; drawn: boolean; atoms: boolean };

function spansOnLine(block: BlockOnModel, line: LineBox, range: RangeQuery, tools: GeometryTools): Span[] {
	const { from, to } = range;
	const spans: Span[] = [];
	const end = lineEnd(line);
	for (const fragment of line.fragments) {
		const span = spanOf(fragment);
		if (span) spans.push(span);
	}
	function spanOf(fragment: LineFragment): Span | null {
		if (fragment.kind === 'hyphen') return from < end && to >= end ? { left: fragment.x, right: fragment.x + fragment.width } : null;
		if (!hasPositions(fragment)) return null;
		const a = Math.max(from, fragment.from);
		const b = Math.min(to, fragment.to);
		if (b < a || (b === a && fragment.to > fragment.from)) return null;
		if (fragment.kind === 'atomic') return range.atoms ? { left: fragment.x, right: fragment.x + fragment.width } : null;
		const xa = textX(fragment, a, block.node, tools.measure);
		const xb = textX(fragment, b, block.node, tools.measure);
		return { left: Math.min(xa, xb), right: Math.max(xa, xb) };
	}
	spans.sort((a, b) => a.left - b.left);
	const merged: Span[] = [];
	for (const span of spans) {
		const last = merged.at(-1);
		if (last && span.left <= last.right + 0.5) last.right = Math.max(last.right, span.right);
		else merged.push({ ...span });
	}
	const last = merged.at(-1);
	if (last && to > end) last.right += line.endExtension;
	return merged;
}

/** the boxes that clip a textblock's overflow, intersected, block space; null when none does */
export function clipOf(textblock: PlacedTextblock, top: number): DocRect | null {
	let clip: DocRect | null = null;
	for (let at = textblock.parent; at; at = at.parent) {
		if (!at.box.clip) continue;
		const box = { x: at.x, y: top + at.y, width: at.box.width, height: at.box.height };
		if (!clip) clip = box;
		else {
			const x = Math.max(clip.x, box.x);
			const y = Math.max(clip.y, box.y);
			clip = {
				x,
				y,
				width: Math.max(0, Math.min(clip.x + clip.width, box.x + box.width) - x),
				height: Math.max(0, Math.min(clip.y + clip.height, box.y + box.height) - y)
			};
		}
	}
	return clip;
}

export function clipped(rect: DocRect, clip: DocRect | null): DocRect | null {
	if (!clip) return rect;
	const x = Math.max(rect.x, clip.x);
	const right = Math.min(rect.x + rect.width, clip.x + clip.width);
	const y = Math.max(rect.y, clip.y);
	const bottom = Math.min(rect.y + rect.height, clip.y + clip.height);
	return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
}

function lineRects(block: BlockOnModel, textblock: PlacedTextblock, range: RangeQuery, tools: GeometryTools): DocRect[] {
	const rects: DocRect[] = [];
	// what an overflow clip hides is not shaded either: a wide table's cells past its edge
	const clip = clipOf(textblock, block.frame.top);
	const { reach } = range;
	const top = block.frame.top + textblock.y;
	for (const line of textblock.lines) {
		const end = lineEnd(line);
		if (range.to < line.from || range.from > end || (range.from === end && range.to > end && line !== textblock.lines.at(-1))) continue;
		const [y, height] = reach === 'line' ? [line.y, line.height] : [line.textTop, line.textBottom - line.textTop];
		for (const span of spansOnLine(block, line, range, tools)) {
			const rect = clipped({ x: textblock.x + span.left, y: top + y, width: Math.max(0, span.right - span.left), height }, clip);
			if (rect) rects.push(rect);
		}
	}
	return rects;
}

/** block nodes with no text of their own, drawn whole and covered by the range: shaded once, by the outermost box */
export function drawnBoxes(block: BlockOnModel, from: number, to: number): DocRect[] {
	const { textblocks, nodeBoxes } = block.placement;
	const candidates = new Set<PlacedBox>();
	for (const placed of nodeBoxes.values()) {
		const { node, offset } = placed.box.node!;
		const end = offset + node.nodeSize;
		const holdsText = textblocks.some((textblock) => textblock.offset >= offset && textblock.offset < end);
		if (node.isBlock && !holdsText && from <= offset && end <= to) candidates.add(placed);
	}
	const rects: DocRect[] = [];
	for (const placed of candidates) {
		let inner = false;
		for (let at = placed.parent; at && !inner; at = at.parent) inner = candidates.has(at);
		if (!inner) rects.push({ x: placed.x, y: block.frame.top + placed.y, width: placed.box.width, height: placed.box.height });
	}
	return rects;
}

/** one block's part of a range, offsets from its start; a frame top of 0 answers in the block's own space */
export function blockRangeRects(block: BlockOnModel, range: RangeQuery, tools: GeometryTools): DocRect[] {
	const rects: DocRect[] = [];
	for (const textblock of block.placement.textblocks) {
		const end = textblock.offset + textblock.node.nodeSize - 1;
		if (range.to < textblock.offset + 1 || range.from > end) continue;
		rects.push(...lineRects(block, textblock, range, tools));
	}
	if (range.drawn) rects.push(...drawnBoxes(block, range.from, range.to));
	return rects;
}

export function rangeRectsOf(
	model: DocumentModel,
	tools: GeometryTools,
	range: { from: number; to: number; reach: 'line' | 'text'; drawn: boolean }
): DocRect[] {
	const { from, to } = range;
	if (!model.count || to < from) return [];
	const rects: DocRect[] = [];
	for (let index = model.indexAt(from); index < model.count; index++) {
		const block = blockOnModel(model, index);
		if (!block || (block.frame.pos >= to && to > from)) break;
		rects.push(...blockRangeRects(block, { ...range, atoms: true, from: from - block.frame.pos, to: to - block.frame.pos }, tools));
		if (block.frame.pos + block.node.nodeSize >= to) break;
	}
	return rects;
}

/** EditContext character bounds: one rect per position, the character after it in its font */
export function charRectsOf(model: DocumentModel, tools: GeometryTools, from: number, to: number): DocRect[] {
	const rects: DocRect[] = [];
	for (let pos = from; pos < to; pos++) {
		const spot = caretSpotOf(model, { pos, affinity: 1 });
		if (!spot) {
			rects.push({ x: 0, y: model.count ? model.top(model.indexAt(pos)).y : 0, width: 0, height: 0 });
			continue;
		}
		const start = caretRectAt(spot, tools, 1);
		const next = caretSpotOf(model, { pos: pos + 1, affinity: -1 });
		const end = next && next.index === spot.index && next.textblock === spot.textblock ? caretRectAt(next, tools, -1) : start;
		rects.push({ x: Math.min(start.x, end.x), y: start.y, width: Math.abs(end.x - start.x), height: start.height });
	}
	return rects;
}

/** the box around rects, as an inline element's box spans its lines */
export function rectUnion(rects: readonly DocRect[]): DocRect | null {
	if (!rects.length) return null;
	const left = Math.min(...rects.map((r) => r.x));
	const top = Math.min(...rects.map((r) => r.y));
	return {
		x: left,
		y: top,
		width: Math.max(...rects.map((r) => r.x + r.width)) - left,
		height: Math.max(...rects.map((r) => r.y + r.height)) - top
	};
}
