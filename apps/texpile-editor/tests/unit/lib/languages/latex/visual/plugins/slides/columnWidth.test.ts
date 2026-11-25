import { expect, it } from 'vitest';
import { readColumnWidth } from '$lib/languages/latex/visual/plugins/slides/columnWidth';

it('a column width is set once it reads back whole, never half typed', () => {
	expect(readColumnWidth('0.3\\textwidth')).toBe('0.3\\textwidth');
	expect(readColumnWidth('{0.3')).toBeNull();
});
