import { describe, expect, it } from 'vitest';
import { definedBesides, documentSources } from '$lib/workspace/document/documentSources';

function reader(files: Record<string, string>) {
	return async (path: string) => {
		if (!(path in files)) throw new Error('ENOENT');
		return files[path];
	};
}

describe('documentSources', () => {
	it('follows an \\input in the preamble, which the packages and macros of the document may come from', async () => {
		const files = {
			'/w/main.tex': '\\documentclass{article}\n\\input preamble\n\\begin{document}\\end{document}',
			'/w/preamble.tex': '\\usepackage{booktabs}\\newcommand{\\mine}{x}'
		};
		const sources = await documentSources('/w/main.tex', '/w', reader(files));
		expect(sources?.files.map((f) => f.path)).toEqual(['/w/main.tex', '/w/preamble.tex']);
		expect(definedBesides(sources, '/w/main.tex')?.names.has('mine')).toBe(true);
	});

	it('is incomplete when a file it brings in is not there', async () => {
		const sources = await documentSources('/w/main.tex', '/w', reader({ '/w/main.tex': '\\input{gone}' }));
		expect(sources?.complete).toBe(false);
		expect(definedBesides(sources, '/w/main.tex')).toBeNull();
	});

	it('reads a .sty the folder holds for a package with no data, and leaves one with data to the data', async () => {
		const files = {
			'/w/main.tex': '\\documentclass{article}\n\\usepackage{mystyle,amsmath,nothere}\n\\begin{document}\\end{document}',
			'/w/mystyle.sty': '\\RequirePackage{xcolor}\\newcommand{\\mine}{x}',
			'/w/amsmath.sty': '\\newcommand{\\shadow}{x}'
		};
		const sources = await documentSources('/w/main.tex', '/w', reader(files));
		expect(sources?.files.map((f) => f.path)).toEqual(['/w/main.tex', '/w/mystyle.sty']);
		expect([...(sources?.local ?? [])]).toEqual(['mystyle']);
		expect(definedBesides(sources, '/w/main.tex')?.names.has('mine')).toBe(true);
	});

	it('is incomplete when a .cls the folder holds loads a class by a macro', async () => {
		const files = {
			'/w/main.tex': '\\documentclass{mine}\n\\begin{document}\\end{document}',
			'/w/mine.cls': '\\def\\base{article}\\LoadClass{\\base}'
		};
		const sources = await documentSources('/w/main.tex', '/w', reader(files));
		expect(sources?.complete).toBe(false);
		expect(definedBesides(sources, '/w/main.tex')).toBeNull();
	});

	it('reads a .cls with old Mac line endings line by line', async () => {
		const files = {
			'/w/main.tex': '\\documentclass{mine}\n\\begin{document}\\end{document}',
			'/w/mine.cls': '% header\r\\newcommand{\\kept}{x}\r'
		};
		const sources = await documentSources('/w/main.tex', '/w', reader(files));
		expect(definedBesides(sources, '/w/main.tex')?.names.has('kept')).toBe(true);
	});
});
