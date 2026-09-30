// The color vision simulation is a filter: a matrix per deficiency, applied to linear rgb. The
// checks below are the properties that make one right, not the numbers copied back.
import { describe, expect, it } from 'vitest';
import {
	COLOR_VISION_MODES,
	colorVisionLabel,
	colorVisionMatrix,
	feColorMatrixValues,
	parseColorVisionMode
} from '$lib/preview/colorVision/colorVision';

function apply(matrix: readonly number[], rgb: [number, number, number]): number[] {
	return [0, 1, 2].map((row) => matrix[row * 3] * rgb[0] + matrix[row * 3 + 1] * rgb[1] + matrix[row * 3 + 2] * rgb[2]);
}

describe('color vision matrices', () => {
	it('draws the document as it is when nothing is simulated', () => {
		expect(colorVisionMatrix('none')).toBeNull();
		expect(feColorMatrixValues('none')).toBeNull();
	});

	it.each(['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'] as const)('keeps white white and black black under %s', (mode) => {
		const matrix = colorVisionMatrix(mode)!;
		for (const channel of apply(matrix, [1, 1, 1])) expect(channel).toBeCloseTo(1, 5);
		expect(apply(matrix, [0, 0, 0])).toEqual([0, 0, 0]);
	});

	it('draws a pure red as a dark olive for protanopia, as Machado 2009 predicts', () => {
		const [r, g, b] = apply(colorVisionMatrix('protanopia')!, [1, 0, 0]);
		expect(r).toBeCloseTo(0.152286, 6);
		expect(g).toBeCloseTo(0.114503, 6);
		expect(b).toBeLessThan(0);
	});

	it('makes red and green indistinguishable in hue for the red-green deficiencies', () => {
		for (const mode of ['protanopia', 'deuteranopia'] as const) {
			const matrix = colorVisionMatrix(mode)!;
			const red = apply(matrix, [1, 0, 0]);
			const green = apply(matrix, [0, 1, 0]);
			// both land on the yellow-blue axis: red over blue and green over blue, with little blue at all
			expect(red[2]).toBeLessThan(0.05);
			expect(green[2]).toBeLessThan(0.05);
		}
	});

	it('turns every color gray for achromatopsia', () => {
		const matrix = colorVisionMatrix('achromatopsia')!;
		const [r, g, b] = apply(matrix, [0.2, 0.7, 0.1]);
		expect(r).toBeCloseTo(g, 10);
		expect(g).toBeCloseTo(b, 10);
	});

	it('writes a 4x5 feColorMatrix that passes alpha through', () => {
		const values = feColorMatrixValues('deuteranopia')!.split(/\s+/).map(Number);
		expect(values).toHaveLength(20);
		expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
		expect([values[3], values[4], values[8], values[9], values[13], values[14]]).toEqual([0, 0, 0, 0, 0, 0]);
		expect(values.slice(0, 3)).toEqual([...colorVisionMatrix('deuteranopia')!.slice(0, 3)]);
	});
});

describe('color vision modes', () => {
	it('reads back every mode from its menu value, and nothing else', () => {
		for (const mode of COLOR_VISION_MODES) expect(parseColorVisionMode(mode)).toBe(mode);
		expect(parseColorVisionMode('daltonism')).toBeNull();
		expect(parseColorVisionMode(undefined)).toBeNull();
	});

	it('names every mode', () => {
		const labels = COLOR_VISION_MODES.map(colorVisionLabel);
		expect(new Set(labels).size).toBe(COLOR_VISION_MODES.length);
		expect(labels.every((label) => label.length > 0)).toBe(true);
	});
});
