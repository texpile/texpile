// a task item's box as Chromium's native checkbox drew it in the DOM editor
import type { ReplacedContent } from '../../contracts/faceTypes';

const SIZE = 13;
const RADIUS = 2;

type CheckboxInk = { fill: string; border: string; checkedFill: string; check: string };

const LIGHT: CheckboxInk = { fill: '#ffffff', border: '#767676', checkedFill: '#0075ff', check: '#ffffff' };
const DARK: CheckboxInk = { fill: '#3b3b3b', border: '#858585', checkedFill: '#99c8ff', check: '#3b3b3b' };

/** the app's mode is on the root of the document the canvas is in (a recording context has none) */
function inkOf(ctx: CanvasRenderingContext2D): CheckboxInk {
	const doc = (ctx.canvas as HTMLCanvasElement | undefined)?.ownerDocument ?? globalThis.document;
	return doc?.documentElement.dataset.mode === 'dark' ? DARK : LIGHT;
}

export function checkboxContent(checked: boolean): ReplacedContent {
	return {
		intrinsic: () => ({ width: SIZE, height: SIZE }),
		paint(ctx, box) {
			const ink = inkOf(ctx);
			const { x, y, width: w, height: h } = box;
			ctx.save();
			ctx.beginPath();
			ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, RADIUS - 0.5);
			Object.assign(ctx, {
				fillStyle: checked ? ink.checkedFill : ink.fill,
				lineWidth: 1,
				strokeStyle: checked ? ink.checkedFill : ink.border
			});
			ctx.fill();
			ctx.stroke();
			if (checked) {
				ctx.beginPath();
				ctx.moveTo(x + w * 0.2, y + h * 0.5);
				ctx.lineTo(x + w * 0.4, y + h * 0.7);
				ctx.lineTo(x + w * 0.8, y + h * 0.22);
				Object.assign(ctx, { lineWidth: h * 0.16, lineCap: 'round', lineJoin: 'round', strokeStyle: ink.check });
				ctx.stroke();
			}
			ctx.restore();
		}
	};
}
