// @vitest-environment jsdom
// what the DOM editor's mlviewMaterialize tests held, for the canvas: a formula is laid out when drawn, once per source
import { describe, expect, it } from 'vitest';
import { FormulaLayoutCache } from '$lib/editor/canvas/math/mathLayoutCache';
import { formulaLaidOut } from '$lib/editor/canvas/math/mathReplaced';
import { formulaIn, measure, schemaFor, style, viewOf } from './mathViewFixture';

const SCHEMA = schemaFor({});

function countingCache(): { cache: FormulaLayoutCache; made: string[] } {
	const cache = new FormulaLayoutCache(measure);
	const made: string[] = [];
	const layout = cache.layout.bind(cache);
	cache.layout = (source, family) => {
		made.push(source.source);
		return layout(source, family);
	};
	return { cache, made };
}

const laidOut = (view: ReturnType<typeof viewOf>) => {
	formulaIn(view.el).replaced!.intrinsic(style(16));
	return formulaLaidOut(formulaIn(view.el))!.layout;
};

describe('a math view and its formula layout', () => {
	it('lays nothing out and starts no session until the formula is drawn', () => {
		for (const node of [
			SCHEMA.nodes.inline_math.create(null, SCHEMA.text('\\alpha_{ij}')),
			SCHEMA.nodes.block_math.create(null, SCHEMA.text('E=mc^2'))
		]) {
			const { cache, made } = countingCache();
			const view = viewOf(node, 'latex', { layouts: cache });
			expect(made).toEqual([]);
			expect((view.spec as { nested?: unknown }).nested ?? null).toBeNull();
			laidOut(view);
			expect(made.length).toBeGreaterThan(0);
		}
	});

	it('draws a formula laid out before from the kept layout when its view is made again', () => {
		const { cache } = countingCache();
		const node = SCHEMA.nodes.inline_math.create(null, SCHEMA.text('\\kappa^2'));
		expect(laidOut(viewOf(node, 'latex', { layouts: cache }))).toBe(laidOut(viewOf(node, 'latex', { layouts: cache })));
	});

	it('keeps its formula and layout when updated for the same formula, as a Select All over the paper does', () => {
		const { cache } = countingCache();
		const node = SCHEMA.nodes.inline_math.create(null, SCHEMA.text('\\alpha_{ij}'));
		const view = viewOf(node, 'latex', { layouts: cache });
		const formula = formulaIn(view.el);
		const layout = laidOut(view);
		expect(view.update(node)).toBe(true);
		expect(formulaIn(view.el)).toBe(formula);
		expect(laidOut(view)).toBe(layout);
		const display = SCHEMA.nodes.block_math.create({ numbered: true }, SCHEMA.text('x'));
		const numbered = viewOf(display, 'latex', { layouts: cache, numbers: ['(1)'] });
		numbered.update(display, ['(2)']);
		expect(numbered.el.generatedAfter?.textContent, 'a new number is drawn').toBe('(2)');
	});

	it('draws an edit that lands before the formula was drawn', () => {
		const { cache } = countingCache();
		const view = viewOf(SCHEMA.nodes.inline_math.create(null, SCHEMA.text('a+b')), 'latex', { layouts: cache });
		view.update(SCHEMA.nodes.inline_math.create(null, SCHEMA.text('c+d')));
		expect(laidOut(view)).toBe(cache.layout({ syntax: 'latex', source: 'c+d', display: false }, 'serif'));
	});

	it('is destroyed cleanly before it was drawn', () => {
		const view = viewOf(SCHEMA.nodes.inline_math.create(null, SCHEMA.text('x')), 'latex');
		expect(() => view.spec.destroy?.()).not.toThrow();
	});
});
