import { describe, expect, it } from 'vitest';
import type { Drawing } from '$lib/draw/editor/drawing/drawing.types';
import type { LoadedFont } from '$lib/draw/editor/drawing/fontOutlines';
import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';

describe('the drawing as svg', () => {
	it("clips a glyph in the picture's space, not moved by the glyph's own matrix", () => {
		const drawing = {
			bbox: { x: 0, y: 0, w: 10, h: 10 },
			gradients: [],
			clips: [{ id: 'clip1', parent: null, d: 'M0 0L10 0L10 10Z', evenOdd: false }],
			parts: [{ kind: 'glyph', stmt: 1, clip: 'clip1', font: 1, code: 65, matrix: [10, 0, 0, -10, 5, 5], fill: 'black', opacity: 1 }]
		} as unknown as Drawing;
		const svg = drawingToSvg(drawing, new Map([[1, {} as LoadedFont]]), () => 'M0 0L1 1');
		expect(svg).toContain('<g clip-path="url(#clip1)"><path d="M0 0L1 1" transform="matrix(10 0 0 -10 5 5)"');
	});
});
