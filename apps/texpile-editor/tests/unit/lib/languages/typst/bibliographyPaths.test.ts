import { describe, expect, it } from 'vitest';
import { typstBibliographyPaths } from '$lib/languages/typst/bibliographyPaths';

describe('typstBibliographyPaths', () => {
	it('lists every file of the call, one or an array', async () => {
		expect(await typstBibliographyPaths('#bibliography("refs.yml")')).toEqual(['refs.yml']);
		expect(await typstBibliographyPaths('#bibliography(("a.yml", "b.bib"), title: none)')).toEqual(['a.yml', 'b.bib']);
		expect(await typstBibliographyPaths('#bibliography(\n  (\n    "a.bib",\n    "b.yml",\n  ),\n)')).toEqual(['a.bib', 'b.yml']);
	});

	it('skips set rules and commented-out calls for the real one', async () => {
		const src = '#set bibliography(style: "apa")\n// #bibliography("old.bib")\n#bibliography("new.yml")';
		expect(await typstBibliographyPaths(src)).toEqual(['new.yml']);
	});

	it('finds a call after a string holding //, on the same line', async () => {
		expect(await typstBibliographyPaths('#link("https://example.com")[x] #bibliography("r.bib")')).toEqual(['r.bib']);
	});

	it('reads one path in parentheses', async () => {
		expect(await typstBibliographyPaths('#bibliography(("refs.bib"))')).toEqual(['refs.bib']);
	});

	it('skips a comment among the arguments', async () => {
		expect(await typstBibliographyPaths('#bibliography(// main\n  "refs.bib")')).toEqual(['refs.bib']);
	});

	it('is empty when nothing is declared', async () => {
		expect(await typstBibliographyPaths('= Title\nThe word bibliography, in prose.')).toEqual([]);
	});
});
