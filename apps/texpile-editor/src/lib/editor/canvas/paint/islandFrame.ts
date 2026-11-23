// raw source holding the caret shows its bounds, as the DOM editor outlined an island while it held the focus
import type { DocumentModel, PlacedBlock } from '../contracts/engineTypes';
import type { CanvasGeometry } from '../contracts/geometryTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { Rgba } from '../contracts/styleTypes';
import { caretPolicyOf } from '../geometry/caretPolicy';

/** the DOM editor's 1px outline 1px out from the source, in --color-surface-500 at 45 percent */
const OUT = 2;
export const ISLAND_FRAME_SHARE = 0.45;

/** the island the caret is in, framed in this block's own space; none when the caret is in prose */
export function islandFrameRects(model: DocumentModel, geometry: CanvasGeometry, block: PlacedBlock): DocRect[] {
	const { view } = model;
	const { $head } = view.state.selection;
	for (let depth = $head.depth; depth > 0; depth--) {
		const node = $head.node(depth);
		if (caretPolicyOf(view, node) !== 'island') continue;
		// app.css outlined raw source only: a code block keeps its card
		if (node.type.name === 'code_block') return [];
		const from = $head.before(depth);
		const end = block.pos + model.block(block.index).node.nodeSize;
		if (from < block.pos || from >= end) return [];
		const lines = geometry.rangeRects(from + 1, from + node.nodeSize - 1, 'text');
		// a block is framed whole, an inline chip line by line
		const rects = node.isBlock && lines.length ? [boundsOf(lines)] : lines;
		return rects.map((rect) => ({
			x: rect.x - OUT,
			y: rect.y - block.top - OUT,
			width: rect.width + 2 * OUT,
			height: rect.height + 2 * OUT
		}));
	}
	return [];
}

function boundsOf(rects: readonly DocRect[]): DocRect {
	const left = Math.min(...rects.map((rect) => rect.x));
	const top = Math.min(...rects.map((rect) => rect.y));
	const right = Math.max(...rects.map((rect) => rect.x + rect.width));
	const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
	return { x: left, y: top, width: right - left, height: bottom - top };
}

export function islandFrameColor(surface: Rgba): Rgba {
	return { ...surface, a: surface.a * ISLAND_FRAME_SHARE };
}
