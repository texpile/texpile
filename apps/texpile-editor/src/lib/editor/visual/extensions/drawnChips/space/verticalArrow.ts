// a vertical space's arrow: heads at both ends of a 1px line, drawn in the text color at the space's full height
import type { FaceElement, ReplacedContent, Rgba } from '$lib/editor/canvas';
import { chipElement } from '../looks/chipLooks';

// whole pixels and an odd width, so the heads' tips and the line share one center
const WIDTH = 9;
const HEAD = 6;

function fillOf(color: Rgba): string {
	function byte(channel: number): number {
		return Math.round(Math.min(1, Math.max(0, channel)) * 255);
	}
	return `rgba(${byte(color.r)}, ${byte(color.g)}, ${byte(color.b)}, ${color.a})`;
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, up: boolean): void {
	ctx.beginPath();
	if (up) {
		ctx.moveTo(x + WIDTH / 2, y);
		ctx.lineTo(x + WIDTH, y + HEAD);
		ctx.lineTo(x, y + HEAD);
	} else {
		ctx.moveTo(x, y);
		ctx.lineTo(x + WIDTH, y);
		ctx.lineTo(x + WIDTH / 2, y + HEAD);
	}
	ctx.closePath();
	ctx.fill();
}

/** `ems` is the space's drawn height; a pull upward points the heads at each other */
export function verticalArrow(ems: number, negative: boolean): FaceElement {
	const arrow = chipElement('span', 'drawn-vspace-arrow');
	const content: ReplacedContent = {
		intrinsic: (style) => ({ width: WIDTH, height: ems * style.layout.font.sizePx }),
		paint(ctx, box, style) {
			Object.assign(ctx, { fillStyle: fillOf(style.color) });
			head(ctx, box.x, box.y, !negative);
			ctx.fillRect(box.x + (WIDTH - 1) / 2, box.y + HEAD, 1, Math.max(0, box.height - 2 * HEAD));
			head(ctx, box.x, box.y + box.height - HEAD, negative);
		}
	};
	arrow.replaced = content;
	return arrow;
}
