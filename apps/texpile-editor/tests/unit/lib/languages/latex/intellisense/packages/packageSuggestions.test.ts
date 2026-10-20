import { describe, expect, it } from 'vitest';
import { loadFiles } from '$lib/languages/latex/knowledge/loadedFiles';
import { packageSuggestions } from '$lib/languages/latex/intellisense/packages/packageSuggestions';

const suggestedFrom = async (packages: string[]) => {
	const loaded = await loadFiles(
		[{ name: 'latex-document', options: [] }, { name: 'class-article', options: [] }, ...packages.map((name) => ({ name, options: [] }))],
		[],
		null
	);
	return new Set((await packageSuggestions(loaded, '')).macros.map((m) => m.detail));
};

describe('packageSuggestions', () => {
	it('leaves out a suggestion TeX fails to load after a package the document has', async () => {
		expect(await suggestedFrom([])).toContain('natbib');
		expect(await suggestedFrom(['biblatex'])).not.toContain('natbib');
	});
});
