import { describe, expect, it } from 'vitest';
import { paintCaretDraws } from '$lib/editor/canvas/paint/caretLayer';
import { replayDisplayList, type PaintOp } from '$lib/editor/canvas/paint/displayList';

/** a context under the frame's transform for a centered column: half a device pixel in x, a quarter in y */
function centeredColumnContext(scale: number) {
	const fills: { left: number; top: number; right: number; bottom: number }[] = [];
	const matrix = { a: scale, b: 0, c: 0, d: scale, e: 124.5 * scale, f: 0.25 * scale };
	const context = {
		getTransform: () => matrix,
		fillRect: (x: number, y: number, width: number, height: number) =>
			fills.push({
				left: x * matrix.a + matrix.e,
				top: y * matrix.d + matrix.f,
				right: (x + width) * matrix.a + matrix.e,
				bottom: (y + height) * matrix.d + matrix.f
			}),
		setLineDash: () => {}
	} as unknown as CanvasRenderingContext2D;
	return { context, fills };
}

function onWholePixels(edges: readonly number[]): boolean {
	return edges.every((edge) => Math.abs(edge - Math.round(edge)) < 1e-9);
}

describe('device pixels', () => {
	it.each([1, 2])('draws the caret one crisp device pixel wide at a device pixel ratio of %i', (scale) => {
		const { context, fills } = centeredColumnContext(scale);
		paintCaretDraws(context, [{ kind: 'local', rect: { x: 276.6, y: 40.3, width: 1, height: 20 }, visible: true, color: '#404549' }]);
		const [caret] = fills;
		expect(onWholePixels([caret.left, caret.top, caret.right, caret.bottom])).toBe(true);
		expect(caret.right - caret.left).toBe(scale);
	});

	it('lands a one pixel border on whole device pixels', () => {
		const { context, fills } = centeredColumnContext(1);
		const border: PaintOp = {
			kind: 'border',
			rect: { x: 10.2, y: 30.6, width: 200, height: 50 },
			widths: { top: 1, right: 0, bottom: 1, left: 0 },
			colors: { top: '#cdcdcd', right: '#cdcdcd', bottom: '#cdcdcd', left: '#cdcdcd' },
			styles: { top: 'solid', right: 'solid', bottom: 'solid', left: 'solid' },
			radii: null
		};
		replayDisplayList(context, [border], () => ({ r: 0, g: 0, b: 0, a: 1 }));
		expect(fills).toHaveLength(2);
		for (const rule of fills) {
			expect(onWholePixels([rule.left, rule.top, rule.right, rule.bottom])).toBe(true);
			expect(rule.bottom - rule.top).toBe(1);
		}
	});
});
