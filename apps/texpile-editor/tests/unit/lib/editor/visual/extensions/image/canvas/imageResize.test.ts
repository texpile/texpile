import { describe, expect, it } from 'vitest';
import { draggedSize, resizedAttrs } from '$lib/editor/visual/extensions/image/canvas/imageResize';
import { ResizeDirection } from '$lib/editor/visual/extensions/image/types';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

const SIZES = { minSize: 50, maxSize: 2000 };
const start = { width: 300, height: 150 };

describe('a figure dragged by its handles', () => {
	it('follows a side at twice the pace, snapped to tenths of the column', () => {
		expect(draggedSize(ResizeDirection.RIGHT, start, 52, 0, 600, SIZES)).toEqual({ width: 420, height: null });
		expect(draggedSize(ResizeDirection.LEFT, start, 52, 0, 600, SIZES)).toEqual({ width: 180, height: null });
	});

	it('keeps the proportion from a corner and sets only the height from the top or bottom', () => {
		expect(draggedSize(ResizeDirection.BOTTOM_RIGHT, start, 30, 0, 600, SIZES)).toEqual({ width: 360, height: 180 });
		expect(draggedSize(ResizeDirection.BOTTOM, start, 0, 40, 600, SIZES)).toEqual({ width: null, height: 190 });
	});

	it('writes the snapped width, the height in proportion and the column it was sized in', () => {
		const node = schema.nodes.image.create({ src: 'a.png', width: 300 }, schema.text('A.'));
		expect(resizedAttrs(node, { width: 340, height: 170 }, 600)).toMatchObject({ width: 360, height: 180, maxWidth: 600 });
	});
});
