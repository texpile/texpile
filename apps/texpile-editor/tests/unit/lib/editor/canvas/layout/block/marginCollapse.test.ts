import { it, expect } from 'vitest';
import { adjoin, marginOf, resolveMargin } from '$lib/editor/canvas/layout/marginCollapse';

it('adjoins the largest positive margin and the most negative one', () => {
	expect(resolveMargin(adjoin(marginOf(12), marginOf(20)))).toBe(20);
	expect(resolveMargin(adjoin(marginOf(20), marginOf(-5)))).toBe(15);
	expect(resolveMargin(adjoin(adjoin(marginOf(-4), marginOf(-10)), marginOf(6)))).toBe(-4);
});
