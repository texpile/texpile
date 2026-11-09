import { describe, expect, it } from 'vitest';
import { declaredShades, filledShadesCss, fillFamily } from '$lib/customThemes/shadeFill';

function byVar(family: string): (shade: number) => string {
	return (shade) => `var(--color-${family}-${shade})`;
}

describe('a color family a theme sets in part', () => {
	it('gets its missing shades blended between the ones it sets, white past the lightest and black past the darkest', () => {
		const filled = fillFamily(declaredShades(':root { --color-primary-500: #82aaff; }', 'primary'), byVar('primary'));
		expect(filled.get(50)).toBe('color-mix(in oklab, var(--color-primary-500) 6%, white)');
		expect(filled.get(950)).toBe('color-mix(in oklab, var(--color-primary-500) 25%, black)');
		expect(filled.get(300)).toBe('color-mix(in oklab, var(--color-primary-50) 40%, var(--color-primary-500))');
		expect(filled.get(800)).toBe('color-mix(in oklab, var(--color-primary-500) 40%, var(--color-primary-950))');
		expect(filled.has(500)).toBe(false);
	});

	it('gets text colors for every shade of a family it touches, and keeps the ones it sets', () => {
		const css = filledShadesCss(':root { --color-surface-950: #011627; --color-surface-contrast-950: #fff; }');
		expect(css).toContain('--color-surface-contrast-500: oklch(from var(--color-surface-500) calc((0.62 - l) * 1000) 0 0);');
		expect(css).not.toContain('--color-surface-contrast-950:');
		expect(css).not.toContain('--color-primary-');
		expect(filledShadesCss(':root { --color-surface-50-950: red; }')).toBe('');
	});

	it('is filled in dark mode only when the theme sets it in dark mode only', () => {
		const css = filledShadesCss(":root { --syntax-keyword: #c792ea; }\n[data-mode='dark'] { --color-surface-950: #011627; }");
		expect(css).not.toContain(':root');
		expect(css).not.toContain("[data-mode='light']");
		expect(css).toContain("[data-mode='dark'] {\n\t--color-surface-50: color-mix(in oklab, var(--color-surface-950) 6%, white);");
	});
});
