import { describe, expect, it } from 'vitest';
import { stripFor } from '$lib/editor/visual/stripFor';
import { stripMarkdown } from '$lib/languages/markdown/visual/sourceMap';
import { stripTypst } from '$lib/languages/typst/visual/sourceMap';

describe('stripFor', () => {
	it('selects by dialect and leaves LaTeX on the default', () => {
		expect(stripFor('markdown')).toBe(stripMarkdown);
		expect(stripFor('md')).toBe(stripMarkdown);
		expect(stripFor('typst')).toBe(stripTypst);
		expect(stripFor('typ')).toBe(stripTypst);
		expect(stripFor('latex')).toBeUndefined();
		expect(stripFor(null)).toBeUndefined();
	});
});
