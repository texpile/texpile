import { describe, expect, it } from 'vitest';
import { typstBibliographyPaths } from '$lib/languages/typst/bibliographyPaths';

describe('typstBibliographyPaths', () => {
	it('lists every file of the call, one or an array', () => {
		expect(typstBibliographyPaths('#bibliography("refs.yml")')).toEqual(['refs.yml']);
		expect(typstBibliographyPaths('#bibliography(("a.yml", "b.bib"), title: none)')).toEqual(['a.yml', 'b.bib']);
		expect(typstBibliographyPaths('#bibliography(\n  (\n    "a.bib",\n    "b.yml",\n  ),\n)')).toEqual(['a.bib', 'b.yml']);
	});

	it('skips set rules and commented-out calls for the real one', () => {
		const src = '#set bibliography(style: "apa")\n// #bibliography("old.bib")\n#bibliography("new.yml")';
		expect(typstBibliographyPaths(src)).toEqual(['new.yml']);
	});

	it('finds a call after a string holding //, on the same line', () => {
		expect(typstBibliographyPaths('#link("https://example.com")[x] #bibliography("r.bib")')).toEqual(['r.bib']);
	});

	it('is empty when nothing is declared', () => {
		expect(typstBibliographyPaths('= Title\nThe word bibliography, in prose.')).toEqual([]);
	});
});
