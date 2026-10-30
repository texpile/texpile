// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isTypstBibliography } from '$lib/languages/typst/visual/extensions/typstBibliographyView.svelte';

describe('a bibliography chip shown as its card', () => {
	it('is one opening with the call, a label after it included', () => {
		expect(isTypstBibliography('#bibliography("r.bib") <refs>')).toBe(true);
		expect(isTypstBibliography('#bibliography("r.bib", title: none)')).toBe(true);
		expect(isTypstBibliography('#set bibliography(style: "apa")')).toBe(false);
	});
});
