// a box that scrolls its overflow sideways (overflow-x auto or scroll): a wide table. Its element keeps the offset, and the
// box's children are placed that far left inside its clip, so paint, hits, carets and ranges all move with it
import type { LayoutBox } from '../contracts/layoutTypes';

export function scrollsX(box: LayoutBox): boolean {
	const overflow = box.style.layout.overflowX;
	return box.clip && (overflow === 'auto' || overflow === 'scroll');
}

/** how far `box`'s children and what overflows them reach right of its left edge; a clipping child keeps its overflow */
function reachOf(box: LayoutBox): number {
	let right = 0;
	for (const child of box.children) {
		const own = child.width + Math.max(0, child.margin.right);
		right = Math.max(right, child.x + (child.clip ? own : Math.max(own, reachOf(child))));
	}
	return right;
}

/** how far the box's content reaches right of its border box's left edge */
export function scrollWidthOf(box: LayoutBox): number {
	const { padding, borderWidth } = box.style.layout;
	return reachOf(box) + padding.right.px + borderWidth.right;
}

/** the farthest the box scrolls; 0 when its content fits */
export function maxScrollLeft(box: LayoutBox): number {
	return scrollsX(box) ? Math.max(0, Math.ceil(scrollWidthOf(box) - box.width)) : 0;
}

/** the box's offset now, kept inside what it can scroll as its content changes width */
export function scrollLeftOf(box: LayoutBox): number {
	const max = maxScrollLeft(box);
	return max ? Math.min(max, Math.max(0, box.element?.scrollLeft ?? 0)) : 0;
}
