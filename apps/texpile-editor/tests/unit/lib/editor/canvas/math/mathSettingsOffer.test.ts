// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { latexNodeViews } from '$lib/languages/latex/visual/latexNodeViews';
import { markdownNodeViews } from '$lib/languages/markdown/visual/markdownNodeViews';
import { typstNodeViews } from '$lib/languages/typst/visual/typstNodeViews';

it('offers the equation settings to the handle and the math menu, except on a Markdown display', () => {
	expect(latexNodeViews({ imageDir: () => '' }).blockSettings?.block_math).toBeDefined();
	expect(typstNodeViews(() => '').blockSettings?.block_math).toBeDefined();
	expect(markdownNodeViews().blockSettings?.block_math).toBeUndefined();
});
