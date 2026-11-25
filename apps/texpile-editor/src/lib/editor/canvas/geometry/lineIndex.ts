// a laid-out block's boxes and textblock lines placed in the block's own space, and lines in doc space (7.2)
import type { Node as PMNode } from 'prosemirror-model';
import type { LineGeometry } from '../contracts/geometryTypes';
import type { BlockLayout, LayoutBox, LineBox, LineFragment } from '../contracts/layoutTypes';
import type { DocumentModel } from '../contracts/engineTypes';
import type { FaceElement } from '../tree/faceElement';
import { NodeLocator } from '../layout/nodeLocator';
import { scrollLeftOf } from '../layout/scrollBox';

/** a box with its border-box origin: x from the column origin, y from the block's top */
export type PlacedBox = {
	readonly box: LayoutBox;
	readonly x: number;
	readonly y: number;
	readonly parent: PlacedBox | null;
	/** the textblock whose line holds this box (an inline atom, a widget) */
	readonly inLine: PlacedTextblock | null;
};

export type PlacedTextblock = PlacedBox & {
	/** before the textblock, from the block's start */
	readonly offset: number;
	readonly node: PMNode;
	readonly lines: readonly LineBox[];
};

export type BlockPlacement = {
	readonly node: PMNode;
	/** every box in tree order, atoms on lines after their textblock */
	readonly boxes: readonly PlacedBox[];
	readonly textblocks: readonly PlacedTextblock[];
	/** the box of each node's root element by the node's offset */
	readonly nodeBoxes: ReadonlyMap<number, PlacedBox>;
	readonly placed: ReadonlyMap<LayoutBox, PlacedBox>;
	/** a box's children in flow (atoms on its lines left out) */
	readonly children: ReadonlyMap<PlacedBox, readonly PlacedBox[]>;
};

/** a block's top-level node and the place it sits at now: the layout is the node's, wherever it moved */
export type BlockFrame = { readonly pos: number; readonly top: number; readonly estimated: boolean };

const placements = new WeakMap<BlockLayout, BlockPlacement>();

/** toDOM's ['pre', ['code', 0]]: the box that lays a textblock's lines out holds its hole an inline wrapper or two down */
function holeUnder(element: FaceElement | null): FaceElement | null {
	for (let el = element; el; el = el.childNodes.length === 1 ? el.firstElementChild : null) if (el.hole) return el;
	return null;
}

export function placementOf(layout: BlockLayout, node: PMNode): BlockPlacement {
	const known = placements.get(layout);
	if (known && known.node === node) return known;
	const boxes: PlacedBox[] = [];
	const textblocks: PlacedTextblock[] = [];
	const nodeBoxes = new Map<number, PlacedBox>();
	const placedBoxes = new Map<LayoutBox, PlacedBox>();
	const children = new Map<PlacedBox, PlacedBox[]>();
	const nodes = new NodeLocator(node);
	function textblockOffset(box: LayoutBox): number | null {
		const hole = box.lines ? holeUnder(box.element) : null;
		if (!hole) return null;
		const start = layout.positions.contentStart(hole);
		return start !== null && nodes.at(start - 1)?.isTextblock ? start - 1 : null;
	}
	function visit(box: LayoutBox, x: number, y: number, parent: PlacedBox | null, inLine: PlacedTextblock | null, onLine = false): void {
		const at = { x: x + box.x, y: y + box.y };
		const offset = textblockOffset(box);
		const textNode = offset === null ? null : nodes.at(offset);
		const placed: PlacedBox | PlacedTextblock =
			textNode && offset !== null
				? { box, ...at, parent, inLine, offset, node: textNode, lines: box.lines! }
				: { box, ...at, parent, inLine };
		boxes.push(placed);
		placedBoxes.set(box, placed);
		if (parent && !onLine) {
			const siblings = children.get(parent);
			if (siblings) siblings.push(placed);
			else children.set(parent, [placed]);
		}
		if ('lines' in placed) textblocks.push(placed as PlacedTextblock);
		if (box.node && !nodeBoxes.has(box.node.offset)) nodeBoxes.set(box.node.offset, placed);
		// a box scrolled sideways places its content that far left, inside its clip
		const scroll = scrollLeftOf(box);
		for (const child of box.children) visit(child, at.x - scroll, at.y, placed, inLine);
		const lineOwner = 'lines' in placed ? (placed as PlacedTextblock) : inLine;
		for (const line of box.lines ?? [])
			for (const fragment of line.fragments) {
				const inner = fragment.kind === 'atomic' ? fragment.box : fragment.kind === 'widget' ? fragment.box : null;
				if (inner) visit(inner, at.x, at.y, placed, lineOwner, true);
			}
	}
	visit(layout.box, 0, 0, null, null);
	textblocks.sort((a, b) => a.offset - b.offset);
	const placement = { node, boxes, textblocks, nodeBoxes, placed: placedBoxes, children };
	placements.set(layout, placement);
	return placement;
}

export function textblockAt(placement: BlockPlacement, offset: number): PlacedTextblock | null {
	return placement.textblocks.find((textblock) => textblock.offset === offset) ?? null;
}

/** the textblock whose content holds the offset */
export function textblockHolding(placement: BlockPlacement, offset: number): PlacedTextblock | null {
	let found: PlacedTextblock | null = null;
	for (const textblock of placement.textblocks)
		if (textblock.offset < offset && offset < textblock.offset + textblock.node.nodeSize) found = textblock;
	return found;
}

export function hasPositions(fragment: LineFragment): fragment is LineFragment & { kind: 'text' | 'atomic' } {
	return fragment.kind === 'text' || fragment.kind === 'atomic';
}

/** the last caret stop on a line: before a hard break that ends it */
export function lineEnd(line: LineBox): number {
	let end = -1;
	for (const fragment of line.fragments) if (hasPositions(fragment)) end = Math.max(end, fragment.to);
	return end < 0 || end >= line.to ? line.to : end;
}

/** where a line's caret sits before its first fragment: the content box's start after the indent, as aligned */
export function lineStartX(textblock: PlacedTextblock, index: number): number {
	const line = textblock.lines[index];
	const positioned = line.fragments.find((fragment) => fragment.kind !== 'hyphen');
	if (positioned) return positioned.x;
	const style = textblock.box.style.layout;
	const left = style.borderWidth.left + style.padding.left.px;
	const right = style.borderWidth.right + style.padding.right.px;
	const width = textblock.box.width - left - right;
	const indent = index === 0 ? style.textIndent.px + (style.textIndent.percent / 100) * width : 0;
	const align = style.textAlign;
	const rtl = style.direction === 'rtl';
	if (align === 'center') return left + width / 2;
	if (align === 'right' || (align === 'end' && !rtl) || ((align === 'start' || align === 'justify') && rtl)) return left + width;
	return left + indent;
}

export function lineGeometryOf(textblock: PlacedTextblock, index: number, frame: BlockFrame): LineGeometry {
	const line = textblock.lines[index];
	const top = frame.top + textblock.y;
	let left = Infinity;
	let right = -Infinity;
	for (const fragment of line.fragments) {
		left = Math.min(left, fragment.x);
		right = Math.max(right, fragment.x + fragment.width);
	}
	if (!line.fragments.length) left = right = lineStartX(textblock, index);
	const hyphen = line.hyphen;
	return {
		ref: { textblock: frame.pos + textblock.offset, index },
		from: frame.pos + line.from,
		to: frame.pos + lineEnd(line),
		top: top + line.y,
		bottom: top + line.y + line.height,
		baseline: top + line.baseline,
		textTop: top + line.textTop,
		textBottom: top + line.textBottom,
		left: textblock.x + left,
		right: textblock.x + right,
		hyphen: hyphen ? { x: textblock.x + hyphen.x, y: top + line.y, width: hyphen.width, height: line.height } : null,
		endExtension: line.endExtension
	};
}

/** the lines holding an offset, earlier first: two where a soft break ends one line and starts the next */
export function linesHolding(textblock: PlacedTextblock, offset: number): number[] {
	const found: number[] = [];
	textblock.lines.forEach((line, index) => {
		if (line.from <= offset && offset <= lineEnd(line)) found.push(index);
	});
	return found;
}

/** a top-level block laid out (or only what it has) and placed where it sits now */
export type BlockOnModel = {
	readonly index: number;
	readonly node: PMNode;
	readonly frame: BlockFrame;
	readonly layout: BlockLayout;
	readonly placement: BlockPlacement;
};

export function blockOnModel(model: DocumentModel, index: number, layOut = true): BlockOnModel | null {
	if (index < 0 || index >= model.count) return null;
	const layout = layOut ? model.layout(index) : model.lastLayout(index);
	if (!layout) return null;
	const { node, pos } = model.block(index);
	const { y, estimated } = model.top(index);
	return { index, node, frame: { pos, top: y, estimated }, layout, placement: placementOf(layout, node) };
}
