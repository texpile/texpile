// the old words a range crosses, by their line boxes (9.4): they hold no positions, so the range's own rects skip them
import type { WidgetDecorationView } from '../contracts/decorationTypes';
import type { DocRect } from '../contracts/layoutTypes';
import { clipOf, clipped } from '../geometry/rangeRects';
import type { BlockOnModel } from '../geometry/lineIndex';

/** a widget of side 1 stands after the position, so a range starting there takes it and one ending there does not */
function crossed(widget: WidgetDecorationView, range: { from: number; to: number }): boolean {
	if (widget.pos > range.from && widget.pos < range.to) return true;
	return widget.pos === range.from ? widget.side > 0 : widget.pos === range.to && widget.side < 0;
}

/** block space with the frame top at the block's own; document positions */
export function struckInRange(
	block: BlockOnModel,
	widgets: readonly WidgetDecorationView[],
	range: { from: number; to: number }
): DocRect[] {
	const keys = new Set<string>();
	for (const widget of widgets) {
		const form = widget.spec.canvas;
		if (form?.kind === 'struck' && crossed(widget, range)) keys.add(`${form.id} ${widget.pos}`);
	}
	if (!keys.size) return [];
	const rects: DocRect[] = [];
	for (const textblock of block.placement.textblocks) {
		const clip = clipOf(textblock, block.frame.top);
		for (const line of textblock.lines) {
			for (const fragment of line.fragments) {
				if (fragment.kind !== 'struck' || !keys.has(fragment.widget)) continue;
				const rect = {
					x: textblock.x + fragment.x,
					y: block.frame.top + textblock.y + line.y,
					width: fragment.width,
					height: line.height
				};
				const shown = clipped(rect, clip);
				if (shown) rects.push(shown);
			}
		}
	}
	return rects;
}
