import { describe, expect, it } from 'vitest';
import { chooseShown, isPdfCurrent } from '$lib/draw/host/card/compiled/compiledFreshness';
import { compiledPictureKey, pictureLines, regionFromBoxes } from '$lib/draw/host/card/compiled/pictureRegion';

describe('the region of a compiled picture', () => {
	it('is the union of the boxes of its first and last line, padded', () => {
		const first = { page: 2, x: 155, y: 142, W: 4, H: 3, bl: 152, bv: 142 };
		const last = { page: 2, x: 155, y: 142, W: 99, H: 70, bl: 148, bv: 206 };
		const other = { page: 3, x: 0, y: 0, W: 500, H: 500 };
		expect(regionFromBoxes([first, last, other], 8)).toEqual({ page: 2, x: 140, y: 128, w: 115, h: 86 });
		expect(regionFromBoxes([])).toBeNull();
	});

	it('numbers the lines the picture spans', () => {
		const text = 'a\n\\begin{tikzpicture}\n  \\draw (0,0);\n\\end{tikzpicture}\nz';
		const from = text.indexOf('\\begin');
		expect(pictureLines(text, from, text.indexOf('\nz'))).toEqual({ first: 2, last: 4 });
	});

	it('is cached by the PDF, its modification time and the region', () => {
		const region = { page: 1, x: 1, y: 2, w: 3, h: 4 };
		const key = compiledPictureKey('/p/main.pdf', 100, region, 2);
		expect(compiledPictureKey('/p/main.pdf', 101, region, 2)).not.toBe(key);
		expect(compiledPictureKey('/p/main.pdf', 100, { ...region, w: 5 }, 2)).not.toBe(key);
		expect(compiledPictureKey('/p/main.pdf', 100, { ...region }, 2)).toBe(key);
	});
});

describe('when the compiled PDF may be shown', () => {
	it('never shows a picture older than the source', () => {
		expect(isPdfCurrent(200, [150, 0])).toBe(true);
		expect(isPdfCurrent(200, [150, 250])).toBe(false);
	});

	it('prefers a drawing made after the compile and the PDF over an older one', () => {
		expect(chooseShown('svg', 300, 'pdf', 200)).toEqual({ svg: 'svg', compiled: null });
		expect(chooseShown('svg', 100, 'pdf', 200)).toEqual({ svg: null, compiled: 'pdf' });
		expect(chooseShown(null, 0, 'pdf', 200)).toEqual({ svg: null, compiled: 'pdf' });
		expect(chooseShown('svg', 100, null, 0)).toEqual({ svg: 'svg', compiled: null });
	});
});
