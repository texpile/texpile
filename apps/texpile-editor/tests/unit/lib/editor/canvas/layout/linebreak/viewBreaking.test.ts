import { it, expect } from 'vitest';
import type { DocumentHyphenation } from '$lib/editor/canvas/layout/linebreak/documentHyphenationLanguage';
import { ViewLineBreaking } from '$lib/editor/canvas/layout/linebreak/viewBreaking';

it('hyphenates in the document language once its patterns arrive, and not at all in a language without patterns', async () => {
	let language: DocumentHyphenation | undefined = 'fr';
	const breaking = new ViewLineBreaking(() => language);
	let arrived = 0;
	breaking.onPatterns(() => arrived++);
	expect(breaking.hyphenator).toBeNull();
	await breaking.patternsLoading();
	expect(breaking.patternsLoading()).toBeNull();
	expect(breaking.hyphenator!('anticonstitutionnellement').length).toBeGreaterThan(0);
	expect(arrived).toBe(1);
	language = 'none';
	expect(breaking.hyphenator).toBeNull();
});
