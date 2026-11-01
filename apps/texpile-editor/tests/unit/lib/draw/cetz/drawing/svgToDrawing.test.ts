import { describe, expect, it } from 'vitest';
import { svgToDrawing } from '$lib/draw/cetz/drawing/svgToDrawing';

describe("a CeTZ drawing's box", () => {
	it('holds the whole width of a line on its edge, as TeX does', () => {
		const svg = '<svg viewBox="0 0 10 0"><g><path fill="none" stroke="#000000" stroke-width="2" d="M 0 0 L 10 0"/></g></svg>';
		expect(svgToDrawing(svg).drawing.bbox).toEqual({ x: -1, y: -1, w: 12, h: 2 });
	});
});

describe('an image in a CeTZ drawing', () => {
	it('is drawn where Typst put it, its top edge above its bottom', () => {
		const svg =
			'<svg viewBox="0 0 10 20"><g transform="translate(5, 0)"><image x="0" y="0" width="10" height="20" href="data:image/png;base64,AA=="/></g></svg>';
		const { drawing } = svgToDrawing(svg);
		const image = drawing.parts.find((p) => p.kind === 'image');
		expect(image?.kind === 'image' && image.path).toBe('data:image/png;base64,AA==');
		expect(drawing.unsupported).not.toContain('image');
		const m = image!.matrix;
		const [top, bottom] = [m[1] * 0 + m[3] * 0 + m[5], m[1] * 0 + m[3] * 1 + m[5]];
		expect(top).toBeGreaterThan(bottom);
		expect(drawing.bbox.w).toBeCloseTo(10);
		expect(drawing.bbox.h).toBeCloseTo(20);
	});
});
