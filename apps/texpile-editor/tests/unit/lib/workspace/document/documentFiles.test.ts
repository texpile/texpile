import { describe, expect, it } from 'vitest';
import { documentAround, documentFiles, namesBibliography } from '$lib/workspace/document/documentFiles';

function reader(files: Record<string, string>) {
	return async (path: string) => {
		if (!(path in files)) throw new Error('ENOENT');
		return files[path];
	};
}

describe('documentFiles', () => {
	it('adds .tex to an \\include name that already has a dot, and follows \\subimport from its own folder', async () => {
		const files = {
			'/w/main.tex': '\\begin{document}\\include{chap.1}\\import{a/}{b}\\end{document}',
			'/w/chap.1.tex': '\\subimport*{sub/}{c}',
			'/w/a/b.tex': 'b',
			'/w/sub/c.tex': 'wrong place'
		};
		const got = await documentFiles('/w/main.tex', '/w', reader(files));
		expect(got.map((f) => [f.path, !!f.missing])).toEqual([
			['/w/main.tex', false],
			['/w/chap.1.tex', false],
			['/w/sub/c.tex', false],
			['/w/a/b.tex', false]
		]);
	});
});

describe('documentAround', () => {
	it('finds the main file of a file its preamble brings in', async () => {
		const files = {
			'/w/main.tex': '\\documentclass{article}\n\\input{preamble}\n\\begin{document}\\input{body}\\end{document}',
			'/w/preamble.tex': '\\usepackage{booktabs}',
			'/w/body.tex': 'text'
		};
		const around = await documentAround('/w/preamble.tex', '/w/main.tex', '/w', reader(files));
		expect(around?.main).toBe('/w/main.tex');
		expect(around?.files.map((f) => f.path)).toEqual(['/w/main.tex', '/w/preamble.tex', '/w/body.tex']);
	});
});

describe('namesBibliography', () => {
	it('matches the .bib a comma list or a biblatex resource names, by file name', () => {
		const text = (t: string) => [{ path: '/w/main.tex', text: t }];
		expect(namesBibliography(text('\\bibliography{x,Refs}'), '/w/lib/refs.bib')).toBe(true);
		expect(namesBibliography(text('\\addbibresource[label=a]{refs.bib}'), '/w/refs.bib')).toBe(true);
		expect(namesBibliography(text('% \\bibliography{refs}'), '/w/refs.bib')).toBe(false);
	});
});
