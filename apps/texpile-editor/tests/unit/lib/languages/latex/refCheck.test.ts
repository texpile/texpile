import { describe, expect, it } from 'vitest';
import { checkRefs, documentFacts, type DocumentFacts, type RefCheckContext } from '$lib/languages/latex/refCheck';

const PROJECT = ['main.tex', 'chapters/intro.tex', 'figures/block.pdf', 'figs/plot.png', 'refs.bib'];

function ctx(over: Partial<RefCheckContext> = {}, files = PROJECT): RefCheckContext {
	const have = new Set(files.map((f) => `/p/${f}`.toLowerCase()));
	return {
		path: '/p/chapters/intro.tex',
		main: '/p/main.tex',
		root: '/p',
		facts: { labels: new Map(), citeKeys: new Set(['he2016']), graphicsPaths: [], texBibs: new Set() },
		exists: (p) => (p.startsWith('/p/') ? have.has(p.toLowerCase()) : null),
		knownKeys: new Set(),
		...over
	};
}

const kinds = (text: string, c = ctx()) => checkRefs(text, c).map((p) => `${p.kind}:${p.name}`);

describe('labels', () => {
	it('finds a label defined twice in the file, or once here and once in another file of the document', () => {
		const facts: DocumentFacts = {
			labels: new Map([['sec:method', '/p/chapters/method.tex']]),
			citeKeys: null,
			graphicsPaths: [],
			texBibs: new Set()
		};
		const text = String.raw`\section{A}\label{sec:a} \section{B}\label{sec:a} \label{sec:method} \label{sec:fine}`;
		const found = checkRefs(text, ctx({ facts }));
		expect(found.map((p) => (p.kind === 'label-twice' ? [p.name, p.elsewhere] : null))).toEqual([
			['sec:a', null],
			['sec:a', null],
			['sec:method', '/p/chapters/method.tex']
		]);
		// the name itself is what is marked
		expect(text.slice(found[0].at, found[0].at + 5)).toBe('sec:a');
	});

	it('leaves a commented-out label, and a macro argument, alone', () => {
		expect(
			kinds(String.raw`\label{a} % \label{a}
\newcommand{\fig}[1]{\label{#1}} \label{#1}`)
		).toEqual([]);
	});
});

describe('citations', () => {
	it('marks a key no bibliography entry has, at the key', () => {
		const text = String.raw`As \citep[p.~3]{he2016, vaswani2017} shows.`;
		const found = checkRefs(text, ctx());
		expect(found.map((p) => p.name)).toEqual(['vaswani2017']);
		expect(text.slice(found[0].at, found[0].at + 11)).toBe('vaswani2017');
	});

	it('knows the \\bibitem keys and the folder bibliography, and checks nothing when the bibliography is not known', () => {
		expect(kinds(String.raw`\cite{a} \bibitem{a} \cite{b}`, ctx({ knownKeys: new Set(['b']) }))).toEqual([]);
		expect(
			kinds(String.raw`\cite{anything}`, ctx({ facts: { labels: new Map(), citeKeys: null, graphicsPaths: [], texBibs: new Set() } }))
		).toEqual([]);
	});

	it('reads no key out of a style command, an alias, or text TeX skips', () => {
		const text = String.raw`\setcitestyle{numbers,square} \defcitealias{he2016}{Paper I} \defcitealias{nokey}{Paper II}
\iffalse \label{x}\label{x}\cite{gone} \fi \begin{comment}\cite{gone2}\end{comment}`;
		expect(kinds(text)).toEqual(['cite-unknown:nokey']);
	});

	it('reads nothing out of \\verb text, a fancyvrb block, or the comment after a \\\\ line break', () => {
		const text = String.raw`Cite with \verb|\cite{yourkey}|, label with \verb+\label{x}+ \label{x}, split with \verb|\input{chapter}|.
\begin{Verbatim}
\cite{gone}
\end{Verbatim}
a & b \\% old row: \cite{dropped2019}
\verb|%| \cite{nokey}`;
		const found = checkRefs(text, ctx());
		expect(found.map((p) => `${p.kind}:${p.name}`)).toEqual(['cite-unknown:nokey']);
		// blanked, never removed: the one left is marked at its own key
		expect(text.slice(found[0].at, found[0].at + 5)).toBe('nokey');
	});
});

describe('files', () => {
	it('finds an image the way graphicx does: any of its formats, from where TeX runs and the \\graphicspath folders', () => {
		expect(kinds(String.raw`\includegraphics[width=\linewidth]{figures/block}`)).toEqual([]);
		expect(kinds(String.raw`\graphicspath{{figs/}} \includegraphics{plot}`)).toEqual([]);
		expect(kinds(String.raw`\includegraphics{figures/missing}`)).toEqual(['file-missing:figures/missing']);
	});

	it('does not guess at a name built from a macro, or at a file outside the folder', () => {
		expect(kinds(String.raw`\includegraphics{\figdir/a} \includegraphics{../elsewhere/a.png}`)).toEqual([]);
	});

	it('checks \\input and \\include in the document body, not the preamble that reads from the installation', () => {
		const main = String.raw`\input{glyphtounicode}
\begin{document}
\input{chapters/intro} \include{chapters/gone}
\end{document}`;
		expect(kinds(main, ctx({ path: '/p/main.tex' }))).toEqual(['file-missing:chapters/gone']);
	});

	it('checks the bibliography files, unless the project builds from its .bbl', () => {
		expect(kinds(String.raw`\bibliography{refs,other}`)).toEqual(['file-missing:other']);
		expect(kinds(String.raw`\bibliography{refs,other}`, ctx({}, [...PROJECT, 'main.bbl']))).toEqual([]);
		expect(kinds(String.raw`\addbibresource[location=remote]{https://example.org/refs.bib} \addbibresource{gone.bib}`)).toEqual([
			'file-missing:gone.bib'
		]);
	});

	it('checks no file where the main file is not known', () => {
		expect(kinds(String.raw`\includegraphics{figures/missing}`, ctx({ main: null }))).toEqual([]);
	});
});

describe('documentFacts', () => {
	const files = [
		{
			path: '/p/main.tex',
			text: String.raw`\graphicspath{{figs/}}\begin{document}\label{sec:intro}\input{a}\bibliography{refs}\end{document}`
		},
		{ path: '/p/a.tex', text: String.raw`\label{sec:a} % \label{sec:commented}` }
	];

	it("reads the other files' labels and the declared bibliography's keys", async () => {
		const facts = await documentFacts(files, '/p/a.tex', '/p/main.tex', '/p', async (p) => {
			if (p === '/p/refs.bib') return '@article{he2016,\n title={x}}\n@book{knuth1984, title={y}}';
			throw new Error('ENOENT');
		});
		expect([...facts.labels]).toEqual([['sec:intro', '/p/main.tex']]);
		expect([...facts.citeKeys!].sort()).toEqual(['he2016', 'knuth1984']);
		expect(facts.graphicsPaths).toEqual(['figs/']);
	});

	it("takes a bibliography the TeX installation has, and leaves the open file's labels out however its path is written", async () => {
		const main = String.raw`\begin{document}\label{sec:intro}\input{a}\bibliography{IEEEabrv,refs}\end{document}`;
		const facts = await documentFacts(
			[{ path: '/p/main.tex', text: main }, files[1]],
			'\\p\\a.tex',
			'/p/main.tex',
			'/p',
			async (p) => {
				if (p === '/p/refs.bib') return '@article{he2016, title={x}}';
				throw new Error('ENOENT');
			},
			async (name) => (name === 'IEEEabrv.bib' ? '@STRING{IEEE_J_AC = "IEEE Trans. Automat. Contr."}' : null)
		);
		expect([...facts.labels.keys()]).toEqual(['sec:intro']);
		expect([...facts.citeKeys!]).toEqual(['he2016']);
		expect(kinds(main, ctx({ path: '/p/main.tex', facts })).filter((k) => k.startsWith('file-missing:IEEE'))).toEqual([]);
	});

	it('knows no keys when a declared bibliography cannot be read', async () => {
		const facts = await documentFacts(files, '/p/a.tex', '/p/main.tex', '/p', async () => {
			throw new Error('ENOENT');
		});
		expect(facts.citeKeys).toBeNull();
	});
});
