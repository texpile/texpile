import { describe, expect, it } from 'vitest';
import { svgToDrawing } from '$lib/draw/cetz/drawing/svgToDrawing';

describe("a CeTZ drawing's box", () => {
	it('holds the whole width of a line on its edge, as TeX does', () => {
		const svg = '<svg viewBox="0 0 10 0"><g><path fill="none" stroke="#000000" stroke-width="2" d="M 0 0 L 10 0"/></g></svg>';
		expect(svgToDrawing(svg).drawing.bbox).toEqual({ x: -1, y: -1, w: 12, h: 2 });
	});
});
