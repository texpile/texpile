import { describe, expect, it } from 'vitest';
import { parseColor } from '$lib/editor/canvas/style/resolve/colorValue';
import { resolveLightDark, resolveRelativeColors } from '$lib/editor/canvas/style/theme/tokenText';

describe('token text', () => {
	it('picks the branch of the scheme, nested ones included', () => {
		const text = 'color-mix(in oklab, light-dark(rgb(1 2 3), light-dark(red, rgb(4 5 6))) 10%, transparent)';
		expect(resolveLightDark(text, false)).toBe('color-mix(in oklab, rgb(1 2 3) 10%, transparent)');
		expect(resolveLightDark(text, true)).toBe('color-mix(in oklab, rgb(4 5 6) 10%, transparent)');
	});

	it('works out a relative oklch color as the link ink tokens write it', () => {
		const ink = (origin: string, side: string): string => resolveRelativeColors(`oklch(from ${origin} ${side} c h)`);
		expect(ink('oklch(0.6266 0.19 252.79)', 'min(l, 0.5)')).toBe('oklch(0.5 0.19 252.79 / 1)');
		expect(ink('oklch(0.6266 0.19 252.79)', 'max(l, 0.85)')).toBe('oklch(0.85 0.19 252.79 / 1)');
		const converted = parseColor(resolveRelativeColors('oklch(from rgb(0 128 0) calc(l - 0.1) c h)'))!;
		expect(converted.g).toBeLessThan(0.5);
	});
});
