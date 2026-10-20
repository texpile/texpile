import { describe, expect, it } from 'vitest';
import { RAW_WHOLESALE_ARG_MACROS } from '$lib/languages/latex/parser/macros';

describe('RAW_WHOLESALE_ARG_MACROS', () => {
	it('holds every definer and loader the data knows, and the converter-decided frontmatter macros', () => {
		for (const name of ['newcommand', 'NewDocumentCommand', 'newtheorem', 'RequirePackage', 'LoadClass', 'footnote']) {
			expect(RAW_WHOLESALE_ARG_MACROS.has(name), name).toBe(true);
		}
		expect(RAW_WHOLESALE_ARG_MACROS.has('multicolumn')).toBe(false);
	});
});
