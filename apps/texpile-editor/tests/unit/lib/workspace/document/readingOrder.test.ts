import { describe, expect, it } from 'vitest';
import { documentSources } from '$lib/workspace/document/documentSources';
import { conditionalUseNames, readingOf, usesInReadingOrder } from '$lib/workspace/document/readingOrder';

function reader(files: Record<string, string>) {
	return async (path: string) => {
		if (!(path in files)) throw new Error('ENOENT');
		return files[path];
	};
}

describe('usesInReadingOrder', () => {
	it('puts the uses of a file brought in where it is brought in, a .sty included', async () => {
		const files = {
			'/w/main.tex': '\\documentclass{article}\n\\usepackage{a}\n\\input{pre}\n\\usepackage{mystyle}\n\\usepackage{d}\n',
			'/w/pre.tex': '\\usepackage{b}\n\\usepackage{c}',
			'/w/mystyle.sty': '\\RequirePackage{e}\\ifx\\a\\b\\RequirePackage{f}\\fi\\AtEndOfPackage{\\RequirePackage{g}}'
		};
		const sources = await documentSources('/w/main.tex', '/w', reader(files));
		const uses = usesInReadingOrder(sources!.files.map((f) => readingOf(f.path, f.text, f.reads, f.library)));
		expect(uses.map((u) => u.name)).toEqual(['class-article', 'a', 'b', 'c', 'e', 'mystyle', 'd']);
		const readings = sources!.files.map((f) => readingOf(f.path, f.text, f.reads, f.library));
		expect(conditionalUseNames(readings)).toEqual(['f', 'g']);
	});

	it('leaves out the uses after \\end{document}', () => {
		const text = '\\usepackage{a}\\begin{document}\\end{document}\n\\usepackage{b}';
		expect(usesInReadingOrder([readingOf('/w/main.tex', text)]).map((u) => u.name)).toEqual(['a']);
	});
});
