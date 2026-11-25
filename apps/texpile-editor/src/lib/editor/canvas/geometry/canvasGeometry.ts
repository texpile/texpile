// the geometry contract (7.2) over one view's document model: every answer from the layout, a block laid out on demand
import type { EditorState } from 'prosemirror-state';
import type {
	CanvasGeometry,
	CaretPlace,
	CaretStops,
	LineGeometry,
	LineRef,
	ScrollBoxAt,
	VisualStep,
	VisualWordStart
} from '../contracts/geometryTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { TextblockDirection } from '../contracts/viewTypes';
import type { DocumentModel } from '../contracts/engineTypes';
import { hasStrongRtl } from '../layout/text/bidiRuns';
import { caretPolicyOf } from './caretPolicy';
import { caretRectAt, caretSpotOf, type CaretSpot } from './caretRects';
import { caretStopsOf, stopOffsets } from './caretStops';
import { hitAt, type HitTools } from './hitTest';
import { blockOnModel, lineEnd, lineGeometryOf, textblockAt, type BlockOnModel, type PlacedBox, type PlacedTextblock } from './lineIndex';
import { fragmentAt, lineX, offsetNearX } from './positionMap';
import { charRectsOf, rangeRectsOf } from './rangeRects';
import { holdsRightToLeft, leafExit, nearEdge, readingDir, stepOnLine, visualPlaces, type VisualPlace } from './visualStops';
import { wordBoundaryIn, wordRangeIn } from './wordRanges';
import { maxScrollLeft } from '../layout/scrollBox';

export type GeometryHost = Omit<HitTools, 'view'> & {
	/** the document's language for word segments ('en-us') */
	readonly language?: () => string;
};

type TextblockOnModel = { block: BlockOnModel; textblock: PlacedTextblock };

const TAKES_CARET = new Set(['text', 'island', 'caption']);

export function createCanvasGeometry(model: DocumentModel, host: GeometryHost): CanvasGeometry {
	const tools: HitTools = { ...host, view: model.view };
	function language(): string {
		return host.language?.() ?? 'en-us';
	}

	function textblockOnModel(textblockPos: number): TextblockOnModel | null {
		if (!model.count) return null;
		const block = blockOnModel(model, model.indexAt(textblockPos));
		const textblock = block && textblockAt(block.placement, textblockPos - block.frame.pos);
		return block && textblock ? { block, textblock } : null;
	}

	function caretTextblocks(block: BlockOnModel): PlacedTextblock[] {
		return block.placement.textblocks.filter((textblock) => TAKES_CARET.has(caretPolicyOf(model.view, textblock.node)));
	}

	function placeOnLine(ref: LineRef, x: number): CaretPlace {
		const found = textblockOnModel(ref.textblock);
		if (!found) return { pos: ref.textblock + 1, affinity: 1 };
		const { block, textblock } = found;
		const index = Math.min(Math.max(ref.index, 0), textblock.lines.length - 1);
		const stops = stopOffsets(textblock.node).map((offset) => textblock.offset + 1 + offset);
		const stop = offsetNearX(textblock, index, x - textblock.x, stops, { top: block.node, measure: host.measure });
		const atEnd = stop === lineEnd(textblock.lines[index]) && index < textblock.lines.length - 1;
		return { pos: block.frame.pos + stop, affinity: atEnd ? -1 : 1 };
	}

	function adjacentLine(ref: LineRef, dir: -1 | 1): LineRef | null {
		const found = textblockOnModel(ref.textblock);
		if (!found) return null;
		const next = ref.index + dir;
		if (next >= 0 && next < found.textblock.lines.length) return { textblock: ref.textblock, index: next };
		for (let index = found.block.index; index >= 0 && index < model.count; index += dir) {
			const block = index === found.block.index ? found.block : blockOnModel(model, index);
			if (!block) continue;
			const textblocks = caretTextblocks(block).filter((textblock) =>
				index !== found.block.index ? true : dir > 0 ? textblock.offset > found.textblock.offset : textblock.offset < found.textblock.offset
			);
			const textblock = dir > 0 ? textblocks[0] : textblocks[textblocks.length - 1];
			if (textblock) return { textblock: block.frame.pos + textblock.offset, index: dir > 0 ? 0 : textblock.lines.length - 1 };
		}
		return null;
	}

	function directionAt(place: CaretPlace): 'ltr' | 'rtl' {
		const spot = caretSpotOf(model, place);
		if (!spot) return 'ltr';
		const fragment = fragmentAt(spot.textblock.lines[spot.index], spot.offset, place.affinity);
		if (fragment?.kind === 'text') return fragment.level % 2 === 1 ? 'rtl' : 'ltr';
		return spot.textblock.box.style.layout.direction;
	}

	function baseDirectionAt(place: CaretPlace): 'ltr' | 'rtl' {
		return caretSpotOf(model, place)?.textblock.box.style.layout.direction ?? 'ltr';
	}

	function placesOnLine(block: BlockOnModel, textblock: PlacedTextblock, index: number): VisualPlace[] {
		const stops = stopOffsets(textblock.node).map((stop) => textblock.offset + 1 + stop);
		return visualPlaces(textblock.lines[index], stops, (stop, affinity) =>
			lineX(textblock, index, stop, affinity, { top: block.node, measure: host.measure })
		);
	}

	/** the place a key going `dir` takes on the line it comes onto: its left end going right, its right end going left */
	function ontoLine(block: BlockOnModel, textblock: PlacedTextblock, index: number, dir: -1 | 1): CaretPlace {
		const line = textblock.lines[index];
		const places = holdsRightToLeft(line) ? placesOnLine(block, textblock, index) : [];
		const entered = dir > 0 ? places[0] : places[places.length - 1];
		if (entered) return { pos: block.frame.pos + entered.offset, affinity: entered.affinity };
		return dir > 0 ? { pos: block.frame.pos + line.from, affinity: 1 } : { pos: block.frame.pos + lineEnd(line), affinity: -1 };
	}

	type LineWalk = { spot: CaretSpot; places: VisualPlace[]; at: number };

	/** the place on its line, where the line holds right-to-left text */
	function lineWalkOf(place: CaretPlace): LineWalk | null {
		const spot = caretSpotOf(model, place);
		if (!spot) return null;
		const line = spot.textblock.lines[spot.index];
		if (!holdsRightToLeft(line)) return null;
		const places = placesOnLine(spot.block, spot.textblock, spot.index);
		const fragment = fragmentAt(line, spot.offset, place.affinity);
		return { spot, places, at: places.findIndex((candidate) => candidate.offset === spot.offset && candidate.fragment === fragment) };
	}

	/** past the line's end: the line a key going `dir` comes onto, or the logical direction it leaves the textblock in */
	function beyondLine(spot: CaretSpot, dir: -1 | 1): CaretPlace | -1 | 1 {
		const forward = dir > 0 !== (spot.textblock.box.style.layout.direction === 'rtl');
		const beyond = spot.index + (forward ? 1 : -1);
		if (!spot.textblock.lines[beyond]) return forward ? 1 : -1;
		return ontoLine(spot.block, spot.textblock, beyond, dir);
	}

	function visualStep(place: CaretPlace, dir: -1 | 1, leaf = false): VisualStep | null {
		const walk = lineWalkOf(place);
		if (!walk) return null;
		const { spot, places, at } = walk;
		const base = spot.block.frame.pos;
		function placeOf(found: VisualPlace): CaretPlace {
			return { pos: base + found.offset, affinity: found.affinity };
		}
		if (leaf) {
			const exit = leafExit(places, spot.offset, dir);
			return exit && { kind: 'place', place: placeOf(exit) };
		}
		if (at < 0) return null;
		const step = stepOnLine(places, at, dir);
		if (step.kind === 'place') return { kind: 'place', place: placeOf(step.place) };
		if (step.kind === 'leaf') return { kind: 'leaf', pos: base + step.from, past: placeOf(step.past) };
		const landing = beyondLine(spot, dir);
		if (typeof landing === 'number') return { kind: 'edge', dir: landing };
		// a landing at the same position shows no move, so the key goes one stop further, as in left-to-right text
		return landing.pos === place.pos ? (visualStep(landing, dir) ?? { kind: 'place', place: landing }) : { kind: 'place', place: landing };
	}

	function visualWordStart(place: CaretPlace, dir: -1 | 1): VisualWordStart | null {
		const walk = lineWalkOf(place);
		if (!walk || walk.at < 0) return null;
		const { spot, places, at } = walk;
		const base = spot.block.frame.pos;
		const step = stepOnLine(places, at, dir);
		if (step.kind === 'leaf') return { kind: 'leaf', past: { pos: base + step.past.offset, affinity: step.past.affinity } };
		if (step.kind === 'edge') {
			const landing = beyondLine(spot, dir);
			if (typeof landing === 'number') return { kind: 'edge', dir: landing };
			return { kind: 'from', place: landing, dir: directionAt(landing) === 'rtl' ? (-dir as -1 | 1) : dir };
		}
		const entered = step.place.fragment === places[at].fragment ? places[at] : nearEdge(places, step.place.fragment, dir);
		return {
			kind: 'from',
			place: { pos: base + entered.offset, affinity: entered.affinity },
			dir: readingDir(step.place.fragment, dir)
		};
	}

	/** prosemirror-view's: on the first or last line of the textblock (up, down), at its start or end (the rest) */
	function endOfTextblock(dir: TextblockDirection, state: EditorState): boolean {
		const { selection } = state;
		const $pos = dir === 'up' ? selection.$from : dir === 'down' ? selection.$to : selection.$head;
		const parent = $pos.parent;
		if (dir === 'up' || dir === 'down') {
			if (!parent.inlineContent) return dir === 'up' ? $pos.index() === 0 : $pos.indexAfter() >= parent.childCount;
			const top = $pos.node(1);
			const block = model.count ? model.block(model.indexAt($pos.before(1))) : null;
			if (!block || block.node !== top) return true;
			const spot = caretSpotOf(model, { pos: block.pos + ($pos.pos - $pos.before(1)), affinity: 1 });
			if (!spot) return true;
			return dir === 'up' ? spot.index === 0 : spot.index === spot.textblock.lines.length - 1;
		}
		if (!parent.isTextblock) return false;
		const atStart = $pos.parentOffset === 0;
		const atEnd = $pos.parentOffset === parent.content.size;
		if (dir === 'backward') return atStart;
		if (dir === 'forward') return atEnd;
		const rtl = hasStrongRtl(parent.textContent) && state === model.view.state && directionAt({ pos: $pos.pos, affinity: 1 }) === 'rtl';
		return (dir === 'left') !== rtl ? atStart : atEnd;
	}

	/** the innermost box of a block that scrolls sideways with more to show, among those `holds` takes */
	function scrollBoxIn(index: number, holds: (placed: PlacedBox, top: number) => boolean): ScrollBoxAt | null {
		const block = blockOnModel(model, index);
		if (!block) return null;
		let found: ScrollBoxAt | null = null;
		for (const placed of block.placement.boxes) {
			const max = maxScrollLeft(placed.box);
			const element = placed.box.element;
			if (!max || !element || !holds(placed, block.frame.top)) continue;
			found = { element, max, rect: { x: placed.x, y: block.frame.top + placed.y, width: placed.box.width, height: placed.box.height } };
		}
		return found;
	}

	return {
		scrollBoxAt(p) {
			if (!model.count) return null;
			return scrollBoxIn(model.indexAtY(p.y), (placed, top) => {
				const y = p.y - top;
				return p.x >= placed.x && p.x <= placed.x + placed.box.width && y >= placed.y && y <= placed.y + placed.box.height;
			});
		},
		scrollBoxOf(pos) {
			const spot = caretSpotOf(model, { pos, affinity: 1 });
			if (!spot) return null;
			for (let at: PlacedBox | null = spot.textblock.parent; at; at = at.parent) {
				const max = maxScrollLeft(at.box);
				const element = at.box.element;
				if (!max || !element) continue;
				const rect = { x: at.x, y: spot.block.frame.top + at.y, width: at.box.width, height: at.box.height };
				return { element, max, rect };
			}
			return null;
		},
		hit: (p) => hitAt(model, tools, p),
		caretRect(place): DocRect | null {
			const spot = caretSpotOf(model, place);
			return spot && caretRectAt(spot, host, place.affinity);
		},
		charRects: (from, to) => charRectsOf(model, host, from, to),
		rangeRects: (from, to, reach, all) => rangeRectsOf(model, host, { from, to, reach, drawn: !!all }),
		nodeRect(pos) {
			if (!model.count) return null;
			const block = blockOnModel(model, model.indexAt(pos));
			const placed = block?.placement.nodeBoxes.get(pos - block.frame.pos);
			if (!block || !placed) return null;
			const { width, height } = placed.box;
			const left = placed.box.style.layout.margin.left;
			return {
				rect: { x: placed.x, y: block.frame.top + placed.y, width, height },
				estimated: block.frame.estimated,
				marginLeft: left === 'auto' ? 0 : left.px
			};
		},
		partRect(pos, part) {
			if (!model.count) return null;
			const block = blockOnModel(model, model.indexAt(pos));
			const owner = block?.placement.nodeBoxes.get(pos - block.frame.pos);
			if (!block || !owner) return null;
			for (const placed of block.placement.boxes) {
				if (placed.box.element?.anchor !== part) continue;
				let at: typeof placed.parent = placed;
				while (at && at !== owner) at = at.parent;
				if (at) return { x: placed.x, y: block.frame.top + placed.y, width: placed.box.width, height: placed.box.height };
			}
			return null;
		},
		rangeTop(pos) {
			if (!model.count) return { y: 0, estimated: true };
			const spot = caretSpotOf(model, { pos, affinity: 1 }, false);
			if (!spot) return { y: model.top(model.indexAt(pos)).y, estimated: true };
			const line = spot.textblock.lines[spot.index];
			return { y: spot.block.frame.top + spot.textblock.y + line.y, estimated: spot.block.frame.estimated };
		},
		lineOf(place): LineGeometry | null {
			const spot = caretSpotOf(model, place);
			return spot && lineGeometryOf(spot.textblock, spot.index, spot.block.frame);
		},
		linesOf(textblockPos) {
			const found = textblockOnModel(textblockPos);
			if (!found) return [];
			return found.textblock.lines.map((_, index) => lineGeometryOf(found.textblock, index, found.block.frame));
		},
		adjacentLine,
		placeOnLine,
		placeAt: (p) => hitAt(model, tools, p)?.caret ?? null,
		stopsOf(textblockPos): CaretStops {
			const node = model.view.state.doc.nodeAt(textblockPos);
			return node?.inlineContent ? caretStopsOf(node, textblockPos) : { textblock: textblockPos, positions: [] };
		},
		wordBoundary: (place, dir, rule) => wordBoundaryIn(model.view.state.doc.resolve(place.pos), dir, rule, language()),
		wordRange: (place) => wordRangeIn(model.view.state.doc.resolve(place.pos), place, language()),
		directionAt,
		baseDirectionAt,
		visualStep,
		visualWordStart,
		endOfTextblock
	};
}
