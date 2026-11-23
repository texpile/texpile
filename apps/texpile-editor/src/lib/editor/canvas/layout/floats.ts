// float: left and right, clear, and the per-line exclusions they make (5.1). The lines beside a float are shortened for
// the first line of what follows it alone, so a float runs in only when it is no taller than a line (a theorem head)
import type { LayoutBoxBuilder } from '../contracts/layoutTypes';

/** the floats placed in one block formatting context, in its content box's coordinates */
export type FloatArea = {
	/** the room a line box at [y, y + height) has between the floats */
	lineWidths(y: number, height: number): { left: number; right: number };
	place(draft: LayoutBoxBuilder, side: 'left' | 'right', y: number): void;
	/** the y a box with this clear value starts at */
	clearance(clear: 'none' | 'left' | 'right' | 'both', y: number): number;
	/** the lowest float's bottom margin edge */
	bottom(): number;
};

type PlacedFloat = { side: 'left' | 'right'; x: number; y: number; width: number; height: number };

export function createFloatArea(width: number): FloatArea {
	const placed: PlacedFloat[] = [];
	function lineWidths(y: number, height: number): { left: number; right: number } {
		let left = 0;
		let right = width;
		for (const float of placed) {
			if (float.y >= y + height || float.y + float.height <= y) continue;
			if (float.side === 'left') left = Math.max(left, float.x + float.width);
			else right = Math.min(right, float.x);
		}
		return { left, right };
	}
	return {
		lineWidths,
		place(draft, side, y) {
			const outer = draft.margin.left + draft.width + draft.margin.right;
			const height = draft.margin.top + draft.height + draft.margin.bottom;
			const room = lineWidths(y, height);
			const x = side === 'left' ? room.left : room.right - outer;
			placed.push({ side, x, y, width: outer, height });
			draft.x = x + draft.margin.left;
			draft.y = y + draft.margin.top;
		},
		clearance(clear, y) {
			const cleared = placed.filter((float) => clear === 'both' || float.side === clear);
			return Math.max(y, ...cleared.map((float) => float.y + float.height));
		},
		bottom: () => Math.max(0, ...placed.map((float) => float.y + float.height))
	};
}

/** a float no taller than this many of its own ems runs in beside the first line of what follows it */
const RUN_IN_EMS = 2;

export function runsIn(float: LayoutBoxBuilder): boolean {
	return float.margin.top + float.height + float.margin.bottom <= RUN_IN_EMS * float.style.layout.font.sizePx;
}

/** what floats take from a box's first line, px off its content box's left and right */
export type FirstLineInset = { readonly left: number; readonly right: number };

const insets = new WeakMap<LayoutBoxBuilder, FirstLineInset>();

export function insetFirstLine(box: LayoutBoxBuilder, inset: FirstLineInset): void {
	if (inset.left > 0 || inset.right > 0) insets.set(box, inset);
	else insets.delete(box);
}

export function firstLineInset(box: LayoutBoxBuilder): FirstLineInset | null {
	return insets.get(box) ?? null;
}
