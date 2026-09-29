import { describe, expect, it } from 'vitest';
import { countProjectWords } from '$lib/workspace/wordCount/projectWords';
import { tallyTotal } from '$lib/workspace/wordCount/proseWords';

function folder(files: Record<string, string>) {
	return async (path: string) => {
		const text = files[path.replace(/\\/g, '/')];
		if (text === undefined) throw new Error(`ENOENT ${path}`);
		return text;
	};
}

describe('countProjectWords', () => {
	it('counts the main file and what it includes, in reading order, each file on its own', async () => {
		const read = folder({
			'/p/thesis.tex': String.raw`\documentclass{report}
\input{macros}
\begin{document}
\include{chapters/intro}
Some words here.
\input{chapters/method.tex}
% \input{chapters/old}
\end{document}`,
			'/p/macros.tex': String.raw`\newcommand{\R}{\mathbb{R}} words that are never printed`,
			'/p/chapters/intro.tex': String.raw`\chapter{Introduction} One two three. \input{chapters/figure}`,
			'/p/chapters/figure.tex': String.raw`\begin{figure}\caption{A figure.}\end{figure}`,
			'/p/chapters/method.tex': 'Four five.'
		});
		const out = await countProjectWords('/p/thesis.tex', '/p', read);
		expect(out.files.map((f) => f.path)).toEqual([
			'/p/thesis.tex',
			'/p/chapters/intro.tex',
			'/p/chapters/figure.tex',
			'/p/chapters/method.tex'
		]);
		expect(out.total).toEqual({ body: 8, headings: 1, captions: 2, footnotes: 0, tables: 0 });
	});

	it('lists a file an include names that is not there, and reads a cycle once', async () => {
		const read = folder({
			'/p/main.tex': String.raw`\begin{document}\input{a}\input{gone}\end{document}`,
			'/p/a.tex': String.raw`Alpha. \input{main}`
		});
		const out = await countProjectWords('/p/main.tex', '/p', read);
		expect(out.files.map((f) => [f.path, f.missing ?? false])).toEqual([
			['/p/main.tex', false],
			['/p/a.tex', false],
			['/p/gone.tex', true]
		]);
		expect(tallyTotal(out.total)).toBe(1);
	});

	it('follows #include from the file that names it in Typst', async () => {
		const read = folder({
			'/p/main.typ': '= Thesis\n#include "chapters/intro.typ"',
			'/p/chapters/intro.typ': 'Intro text.'
		});
		const out = await countProjectWords('/p/main.typ', '/p', read);
		expect(out.total).toMatchObject({ body: 2, headings: 1 });
	});
});
