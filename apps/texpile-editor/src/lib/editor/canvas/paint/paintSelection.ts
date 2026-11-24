// the selection layer (6.4): a range fills the line boxes under its text in every focus state; crossed inline chips
// and drawn blocks are shaded once, by their box, over them
import { AllSelection, Selection, TextSelection } from 'prosemirror-state';
import type { WidgetDecorationView } from '../contracts/decorationTypes';
import type { DocRect } from '../contracts/layoutTypes';
import { struckInRange } from '../decorations/struckInRange';
import type { GeometryTools } from '../geometry/caretRects';
import type { BlockOnModel, PlacedBox } from '../geometry/lineIndex';
import { blockRangeRects, clipOf, clipped, drawnBoxes } from '../geometry/rangeRects';

export type SelectionShade = { readonly under: readonly DocRect[]; readonly over: readonly DocRect[] };

const NONE: SelectionShade = { under: [], over: [] };

/** the range a selection shades; a node or cell selection draws through its classes, an empty one not at all */
export function shadedRange(selection: Selection): { from: number; to: number } | null {
	if (selection.empty || !(selection instanceof TextSelection || selection instanceof AllSelection)) return null;
	const { $to } = selection;
	// an empty last line has no position past it, so a range ending there shades it as select all does
	const endsOnEmptyLast = $to.parent.isTextblock && !$to.parent.content.size && $to.pos === Selection.atEnd($to.doc).to;
	return { from: selection.from, to: endsOnEmptyLast ? $to.doc.content.size : selection.to };
}

/** in the block's space when its frame top is 0 */
export function selectionShade(
	block: BlockOnModel,
	range: { from: number; to: number } | null,
	tools: GeometryTools,
	widgets: readonly WidgetDecorationView[] = []
): SelectionShade {
	if (!range) return NONE;
	const from = range.from - block.frame.pos;
	const to = range.to - block.frame.pos;
	if (to <= 0 || from >= block.node.nodeSize) return NONE;
	const under = blockRangeRects(block, { from, to, reach: 'line', drawn: false, atoms: false }, tools);
	const over = drawnBoxes(block, from, to);
	// a chip drawn whole is shaded by its box though it holds text (a \cref); one whose text has lines of its own is tinted there
	const holdingText = new Set<PlacedBox>();
	for (const textblock of block.placement.textblocks) for (let at = textblock.parent; at; at = at.parent) holdingText.add(at);
	for (const placed of block.placement.boxes) {
		const node = placed.box.node;
		if (!placed.inLine || !node || node.node.isText || holdingText.has(placed)) continue;
		if (node.offset < from || node.offset + node.node.nodeSize > to) continue;
		const rect = { x: placed.x, y: block.frame.top + placed.y, width: placed.box.width, height: placed.box.height };
		const shown = clipped(rect, placed.inLine ? clipOf(placed.inLine, block.frame.top) : null);
		if (shown) over.push(shown);
	}
	over.push(...pictures(block, from, to));
	over.push(...struckInRange(block, widgets, range));
	return { under, over };
}

/** the range runs over the picture: past the node's edge on the picture's side and into its text beyond it */
function passesOver(block: BlockOnModel, picture: PlacedBox, start: number, end: number, from: number, to: number): boolean {
	const text = block.placement.textblocks.filter((each) => each.offset >= start && each.offset < end);
	const first = text.find((each) => each.lines.length);
	if (!first) return false;
	if (picture.y < first.y + first.lines[0].y) return from <= start + 1 && to > first.offset;
	const last = text.at(-1)!;
	return to >= end - 1 && from < last.offset + last.node.nodeSize;
}

/** a picture drawn inside a node that also holds text (a figure and its caption): the text tints by line, the picture by its box */
function pictures(block: BlockOnModel, from: number, to: number): DocRect[] {
	const rects: DocRect[] = [];
	for (const placed of block.placement.boxes) {
		if (placed.box.kind !== 'replaced' || placed.inLine) continue;
		let owner: PlacedBox | null = placed;
		while (owner && !owner.box.node) owner = owner.parent;
		const node = owner?.box.node;
		if (!node || !passesOver(block, placed, node.offset, node.offset + node.node.nodeSize, from, to)) continue;
		rects.push({ x: placed.x, y: block.frame.top + placed.y, width: placed.box.width, height: placed.box.height });
	}
	return rects;
}
