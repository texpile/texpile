import { describe, expect, it } from 'vitest';
import { citationsIn, citedKeys, loadCitedKeys, readCitationsThrough } from '$lib/workspace/document/citedKeys';

const keys = (text: string, lang: 'latex' | 'typst') => [...citationsIn(text, lang).keys].sort();

describe('citationsIn LaTeX', () => {
	it('reads every citing command, its optional arguments and every key in its list', () => {
		const tex = String.raw`As \citet{vaswani2017} and \citep[see][p.~3]{he2016, devlin2019} show, and \Citeauthor*{kingma2014}
		argued \parencite[12]{adam}; \cites[1]{a}[2]{b} and \nocite{hidden}. \autocite{x}\footcite{y}`;
		expect(keys(tex, 'latex')).toEqual(['a', 'adam', 'b', 'devlin2019', 'he2016', 'hidden', 'kingma2014', 'vaswani2017', 'x', 'y'].sort());
		expect(citationsIn(tex, 'latex').all).toBe(false);
	});

	it('takes \\nocite{*} as every entry', () => {
		expect(citationsIn(String.raw`\nocite{*}`, 'latex').all).toBe(true);
	});

	it('does not read a label or a reference as a citation', () => {
		expect(keys(String.raw`\label{sec:intro} see \ref{fig:a} and \eqref{eq:1}`, 'latex')).toEqual([]);
	});
});

describe('citationsIn Typst', () => {
	it('reads @key and cite(), and leaves an email address alone', () => {
		const typ = 'As @vaswani2017 shows, and @he2016[p. 7]. Mail me@example.com. #cite(<kingma2014>) #cite(label("devlin2019"))';
		expect(keys(typ, 'typst')).toEqual(['devlin2019', 'he2016', 'kingma2014', 'vaswani2017']);
	});

	it('takes a full bibliography as every entry', () => {
		expect(citationsIn('#bibliography("refs.bib", full: true)', 'typst').all).toBe(true);
		expect(citationsIn('#bibliography("refs.bib")', 'typst').all).toBe(false);
	});
});

describe('loadCitedKeys', () => {
	it('reads every document in the folder', async () => {
		const files: Record<string, string> = {
			'/p/main.tex': String.raw`\input{intro} \cite{a}`,
			'/p/intro.tex': String.raw`\citep{b}`,
			'/p/notes.typ': '@c',
			'/p/refs.bib': '@article{d, title={x}}'
		};
		readCitationsThrough({
			scan: async (_root, exts) =>
				Object.keys(files)
					.filter((p) => exts.some((e) => p.endsWith(`.${e}`)))
					.map((path) => ({ path, name: path.split('/').pop()!, relPath: path.slice(3) })),
			read: async (p) => files[p]
		});
		await loadCitedKeys('/p');
		expect([...citedKeys.current!.keys].sort()).toEqual(['a', 'b', 'c']);
	});

	it('knows nothing in a folder with no document to read', async () => {
		readCitationsThrough({ scan: async () => [], read: async () => '' });
		await loadCitedKeys('/p');
		expect(citedKeys.current).toBeNull();
	});
});
