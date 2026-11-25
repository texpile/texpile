import { describe, expect, it } from 'vitest';
import { canvasFill, parseColor } from '$lib/editor/canvas/style/resolve/colorValue';

function bytes(value: string, current?: Parameters<typeof parseColor>[1]): number[] | null {
	const color = parseColor(value, current);
	return color && [color.r, color.g, color.b].map((c) => Math.round(c * 255)).concat(Math.round(color.a * 100) / 100);
}

describe('parseColor', () => {
	it('reads every form the three engines serialize a computed color in', () => {
		expect(bytes('rgb(37, 99, 235)')).toEqual([37, 99, 235, 1]);
		expect(bytes('rgba(37, 99, 235, 0.2)')).toEqual([37, 99, 235, 0.2]);
		expect(bytes('rgb(37 99 235 / 20%)')).toEqual([37, 99, 235, 0.2]);
		expect(bytes('color(srgb 0.145098 0.388235 0.921569 / 0.5)')).toEqual([37, 99, 235, 0.5]);
		// the default theme's primary-500, as Chromium mixes it and as Gecko keeps it
		expect(bytes('oklch(0.6266 0.19 252.79)')).toEqual(bytes('oklch(62.66% 0.19 252.79)'));
		expect(bytes('oklab(0.6266 -0.0564 -0.1814)')).toEqual(bytes('oklch(0.6266 0.19 252.73)'));
		expect(bytes('color(display-p3 1 1 1)')).toEqual([255, 255, 255, 1]);
	});

	it('mixes an unresolved color-mix with currentColor the way the muted text token asks', () => {
		const text = parseColor('rgb(20, 30, 40)')!;
		expect(bytes('color-mix(in oklab, currentcolor 60%, transparent)', text)).toEqual([20, 30, 40, 0.6]);
		expect(bytes('color-mix(in srgb, rgb(255, 0, 0) 30%, transparent)')).toEqual([255, 0, 0, 0.3]);
	});

	it('hands the canvas byte channels it accepts in every engine', () => {
		expect(canvasFill(parseColor('oklab(1 0 0 / 0.25)')!)).toBe('rgba(255, 255, 255, 0.25)');
	});
});
