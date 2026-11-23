import { describe, expect, it } from 'vitest';
import { createFontMetrics } from '$lib/editor/canvas/layout/text/fontMetrics';
import type { CanvasSupport } from '$lib/editor/canvas/engine/canvasSupport';
import { canvasFontOf } from '$lib/editor/canvas/layout/text/fontStrings';
import { FIXED_FONT } from '../../testing/fixedStyles';

function context(): Parameters<typeof createFontMetrics>[1] extends (() => infer C) | undefined ? C : never {
	return {
		font: '',
		measureText: () => ({ fontBoundingBoxAscent: 15, fontBoundingBoxDescent: 4, actualBoundingBoxAscent: 12, actualBoundingBoxDescent: 3 })
	};
}

describe('font metrics and font strings', () => {
	it('falls back to the Hg ink bounds where TextMetrics has no font bounding box', () => {
		const support = { fontBoundingBox: false } as CanvasSupport;
		expect(createFontMetrics(support, context)('16px serif')).toMatchObject({ ascent: 12, descent: 3 });
		expect(createFontMetrics({ ...support, fontBoundingBox: true } as CanvasSupport, context)('16px serif')).toMatchObject({
			ascent: 15,
			descent: 4
		});
	});

	it('reads a font again once its face has loaded', () => {
		let ascent = 10;
		const metrics = createFontMetrics({ fontBoundingBox: true } as CanvasSupport, () => ({
			font: '',
			measureText: () => ({
				fontBoundingBoxAscent: ascent,
				fontBoundingBoxDescent: 4,
				actualBoundingBoxAscent: 0,
				actualBoundingBoxDescent: 0
			})
		}));
		expect(metrics('16px Inter').ascent).toBe(10);
		ascent = 15;
		metrics.forget(['Georgia']);
		expect(metrics('16px Inter').ascent).toBe(10);
		metrics.forget(['Inter']);
		expect(metrics('16px Inter').ascent).toBe(15);
	});

	it('carries small caps in the shorthand, which every engine parses', () => {
		expect(canvasFontOf({ ...FIXED_FONT, caps: 'small-caps', weight: 700 })).toBe('normal small-caps 700 16px serif');
		expect(canvasFontOf(FIXED_FONT)).toBe('normal 400 16px serif');
	});
});
