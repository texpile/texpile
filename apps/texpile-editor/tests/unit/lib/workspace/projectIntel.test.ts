// citation keys point at their line in the .bib, with blank lines and comments between entries
import { it, expect } from 'vitest';
import { refreshProjectIntel } from '$lib/workspace/projectIntel';
import { projectIntelStore } from '$lib/stores/projectIntel';

it('gives each .bib entry the line it starts on', async () => {
	const bib = '% refs\n\n@article{a,\n  title = {A}\n}\n\n\n  @book{b,\n  title = {B}}\n@misc{c, title = {C}}\n';
	await refreshProjectIntel([], ['/w/refs.bib'], null, null, async () => bib);
	expect(projectIntelStore.current.bibEntries.map((e) => [e.key, e.line])).toEqual([
		['a', 3],
		['b', 8],
		['c', 10]
	]);
});
