export type BarBox = { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
export type BarSize = { readonly width: number; readonly height: number };

const GAP = 8;
const EDGE = 4;

/**
 * where the bar stands for a block: above it, centered on its visible part. A block at the pane's top with room under it
 * takes the bar below, and a tall one scrolled past its top keeps it at the pane's top. Null when no part of the block is
 * on the pane
 */
export function blockBarPlace(block: BarBox, pane: BarBox, bar: BarSize): { left: number; top: number } | null {
	if (block.bottom < pane.top + EDGE || block.top > pane.bottom - EDGE) return null;
	const above = block.top - GAP - bar.height;
	const below = block.bottom + GAP;
	let top = pane.top + EDGE;
	if (above >= pane.top + EDGE) top = above;
	else if (block.top >= pane.top && below + bar.height <= pane.bottom - EDGE) top = below;
	const center = (Math.max(block.left, pane.left) + Math.min(block.right, pane.right)) / 2;
	const left = Math.min(Math.max(center - bar.width / 2, pane.left + EDGE), pane.right - bar.width - EDGE);
	return { left, top };
}
