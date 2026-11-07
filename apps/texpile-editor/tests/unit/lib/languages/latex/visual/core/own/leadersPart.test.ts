// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { templateFeaturesStore } from '$lib/stores/editorStore';

describe('leaders', () => {
	it('draws a paper’s own fill command as the dots it repeats', () => {
		templateFeaturesStore.current = {
			...templateFeaturesStore.current,
			macros: { cellfill: { def: '\\leavevmode \\leaders \\hb@xt@ .44em{\\hss .\\hss }\\hfill \\kern \\z@', args: 0 } }
		};
		expect(latexFace('\\cellfill', false)?.dom.textContent).toBe('. . . . . .');
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
	});
});
