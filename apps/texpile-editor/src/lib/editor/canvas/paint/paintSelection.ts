// the selection layer (6.4): a range fills the line boxes under its text in every focus state; crossed inline chips
// and drawn blocks are shaded once, by their box, over them
import { AllSelection, TextSelection, type Selection } from 'prosemirror-state';
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
	return { from: selection.from, to: selection.to };
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
	over.push(...struckInRange(block, widgets, range));
	return { under, over };
}
