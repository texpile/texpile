// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { FormulaLayoutCache, SOURCE_FONT } from '$lib/editor/canvas/math/mathLayoutCache';
import { setMathMacros } from '$lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte';

const measure = (font: string, text: string) => 0.5 * Number(/(\d+)px/.exec(font)?.[1] ?? 16) * text.length;

describe('the formula layout cache', () => {
	it('lays a formula out once and again only for new macros', () => {
		const cache = new FormulaLayoutCache(measure);
		const formula = { syntax: 'latex' as const, source: '\\RR + x', display: false };
		const first = cache.layout(formula, 'serif');
		expect(cache.layout(formula, 'serif')).toBe(first);

		setMathMacros({ RR: { def: '\\mathbb{R}', args: 0 } });
		const defined = cache.layout(formula, 'serif');
		expect(defined).not.toBe(first);
		expect(defined.items.some((item) => item.kind === 'glyphs' && item.text === 'R' && item.font.includes('KaTeX_AMS'))).toBe(true);
		setMathMacros({});
	});

	it('sets an inline formula in text style, smaller than the same display (A11)', () => {
		const cache = new FormulaLayoutCache(measure);
		const inline = cache.layout({ syntax: 'latex', source: '\\frac{a}{b}', display: false }, 'serif');
		const display = cache.layout({ syntax: 'latex', source: '\\frac{a}{b}', display: true }, 'serif');
		expect(inline.ascent).toBeLessThan(display.ascent);
		const styled = cache.layout({ syntax: 'latex', source: '\\displaystyle\\frac{a}{b}', display: false }, 'serif');
		expect(styled.ascent).toBeCloseTo(display.ascent);
	});

	it('draws the source where MathLive cannot read the formula', () => {
		// Typst math is read by Typst's own parser, which nothing configured here
		const layout = new FormulaLayoutCache(measure).layout({ syntax: 'typst', source: 'x^2', display: false }, 'serif');
		expect(layout.items).toEqual([{ kind: 'glyphs', x: 0, y: 0, text: 'x^2', font: SOURCE_FONT, color: 'current', opacity: 1 }]);
		expect(layout.width).toBeCloseTo(1.5);
	});
});
