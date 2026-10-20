import { describe, it, expect } from 'vitest';
import { countFileRefs, replaceFileRefs } from '$lib/workspace/fileRefs';

const move = (src: string, from: string, to: string) => replaceFileRefs(src, from, to, 'tex').text;

describe('LaTeX file references follow the extension TeX adds', () => {
	it('matches \\input with or without .tex, and \\include only without', () => {
		expect(countFileRefs('\\input{ch/one}\\input{ch/one.tex}\\input ch/one', 'ch/one.tex', 'tex')).toBe(3);
		expect(countFileRefs('\\include{ch/one}', 'ch/one.tex', 'tex')).toBe(1);
		// TeX reads \include{ch/one.tex} as ch/one.tex.tex
		expect(countFileRefs('\\include{ch/one.tex}', 'ch/one.tex', 'tex')).toBe(0);
		expect(countFileRefs('\\lstinputlisting{code}', 'code.py', 'tex')).toBe(0);
	});

	it('keeps the written style when the file moves', () => {
		expect(move('\\input{ch/one}\\input{ch/one.tex}\\include{ch/one}', 'ch/one.tex', 'part/two.tex')).toBe(
			'\\input{part/two}\\input{part/two.tex}\\include{part/two}'
		);
		expect(move('\\bibliography{a, refs}\\addbibresource{refs.bib}', 'refs.bib', 'bib/refs.bib')).toBe(
			'\\bibliography{a, bib/refs}\\addbibresource{bib/refs.bib}'
		);
		expect(move('\\lstinputlisting[language=Python]{src/a.py}', 'src/a.py', 'code/a.py')).toBe(
			'\\lstinputlisting[language=Python]{code/a.py}'
		);
		expect(move('\\includegraphics[width=3cm]{fig}', 'fig.png', 'img/fig.png')).toBe('\\includegraphics[width=3cm]{img/fig}');
	});

	it('lets a graphic named without an extension stand only for the formats graphicx tries', () => {
		expect(countFileRefs('\\includegraphics{fig}', 'fig.png', 'tex')).toBe(1);
		expect(countFileRefs('\\includegraphics{fig}', 'fig.tex', 'tex')).toBe(0);
	});

	it('reads the file of \\import under its folder and skips comments', () => {
		const src = '\\import{parts/}{intro}\n% \\input{parts/intro}\n';
		expect(countFileRefs(src, 'parts/intro.tex', 'tex')).toBe(1);
		expect(move(src, 'parts/intro.tex', 'parts/sub/intro.tex')).toBe('\\import{parts/}{sub/intro}\n% \\input{parts/intro}\n');
		expect(move(src, 'parts/intro.tex', 'other/intro.tex')).toBe('\\import{parts/}{../other/intro}\n% \\input{parts/intro}\n');
	});
});
