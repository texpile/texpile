import { describe, expect, it } from 'vitest';
import { renameBibSpec, renameSpec, useLanguageOf, wrapperReadingsIn } from '$lib/workspace/edits/renameUses';
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { loadedReadings } from '$lib/languages/latex/knowledge/calls/loadedReadings';
import { replaceInText } from '$lib/search/replaceInFiles';

const rename = (kind: 'label' | 'cite', from: string, to: string, lang: 'latex' | 'typst', text: string) =>
	replaceInText(text, renameSpec(kind, from, to, lang));

describe('renameSpec: LaTeX labels', () => {
	it('renames a label inside every \\...ref command and \\hyperref, and in a \\cref list', () => {
		const text = 'See \\ref{fig:a}, \\eqref{fig:a}, \\cref{fig:b,fig:a}, \\Cref{ fig:a }, \\autoref{fig:a} and \\hyperref[fig:a]{here}.';
		expect(rename('label', 'fig:a', 'fig:results', 'latex', text)).toEqual({
			text: 'See \\ref{fig:results}, \\eqref{fig:results}, \\cref{fig:b,fig:results}, \\Cref{ fig:results }, \\autoref{fig:results} and \\hyperref[fig:results]{here}.',
			count: 6
		});
	});

	it('renames both ends of a cleveref range, and a \\vpageref after its optional texts', () => {
		const text = '\\crefrange{fig:a}{fig:c}, \\Crefrange{fig:c}{fig:a} and \\vpageref[above][below]{fig:a}';
		expect(rename('label', 'fig:a', 'fig:first', 'latex', text)).toEqual({
			text: '\\crefrange{fig:first}{fig:c}, \\Crefrange{fig:c}{fig:first} and \\vpageref[above][below]{fig:first}',
			count: 3
		});
	});

	it('leaves the link text of \\href and \\hyperref', () => {
		const text = '\\href{https://example.com}{fig:a} \\hyperref[sec:x]{fig:a}';
		expect(rename('label', 'fig:a', 'fig:first', 'latex', text)).toEqual({ text, count: 0 });
	});

	it('leaves a longer label, the definition, and the words in the text', () => {
		const text = 'Not \\ref{fig:ab}, not \\label{fig:a}, not fig:a.';
		expect(rename('label', 'fig:a', 'fig:results', 'latex', text)).toEqual({ text, count: 0 });
	});
});

describe('renameSpec: LaTeX citation keys', () => {
	it('renames a key in any \\...cite... command, after its optional arguments, and in a key list', () => {
		const text = '\\cite{knuth84} \\citep[p.~3]{knuth84,lamport} \\parencite[see][12]{knuth84} \\citeauthor*{knuth84} \\nocite{knuth84}';
		expect(rename('cite', 'knuth84', 'knuth1984', 'latex', text)).toEqual({
			text: '\\cite{knuth1984} \\citep[p.~3]{knuth1984,lamport} \\parencite[see][12]{knuth1984} \\citeauthor*{knuth1984} \\nocite{knuth1984}',
			count: 5
		});
		expect(rename('cite', 'knuth84', 'knuth1984', 'latex', '\\textcite{knuth84x} \\ref{knuth84}').count).toBe(0);
		// capitalized commands, and the later key groups of a multicite
		expect(rename('cite', 'knuth84', 'knuth1984', 'latex', '\\Cite{knuth84} \\Citet{knuth84} \\cites[1]{lamport}[2]{knuth84}').text).toBe(
			'\\Cite{knuth1984} \\Citet{knuth1984} \\cites[1]{lamport}[2]{knuth1984}'
		);
	});
});

describe('renameSpec: key arguments only', () => {
	it('leaves the field of \\citefield and the texts of \\citep', () => {
		const text = '\\citefield{knuth84}{title} \\citep[knuth84][knuth84]{lamport} \\setcitestyle{knuth84}';
		expect(rename('cite', 'knuth84', 'knuth1984', 'latex', text).text).toBe(
			'\\citefield{knuth1984}{title} \\citep[knuth84][knuth84]{lamport} \\setcitestyle{knuth84}'
		);
		expect(rename('cite', 'title', 'x', 'latex', text).count).toBe(0);
	});
});

describe("renameSpec: the document's own wrappers", () => {
	const wrappers = wrapperReadingsIn([
		'\\newcommand{\\figref}[1]{\\ref{#1}}\n\\newcommand{\\mycite}[2][]{\\citep[#1]{#2}}\n% \\newcommand{\\ghost}[1]{\\ref{#1}}'
	]);
	const renameWith = (kind: 'label' | 'cite', text: string) => replaceInText(text, renameSpec(kind, 'a', 'b', 'latex', wrappers));

	it('renames a label used through a wrapper, and leaves a commented definition and other arguments', () => {
		expect(renameWith('label', '\\figref{a} \\ref{a} \\ghost{a} \\figref{ab}')).toEqual({
			text: '\\figref{b} \\ref{b} \\ghost{a} \\figref{ab}',
			count: 2
		});
	});

	it('renames a key used through a wrapper after its optional argument', () => {
		expect(renameWith('cite', '\\mycite[p.~3]{a} \\mycite{a}').text).toBe('\\mycite[p.~3]{b} \\mycite{b}');
	});
});

describe('renameSpec: Typst', () => {
	it('renames @name and <name>, and not the full stop that ends a sentence', () => {
		const text = 'See @fig:a. And @fig:ab, #ref(<fig:a>), #cite(<fig:a>) <fig:a> mail@fig:a @fig:a-b';
		expect(rename('label', 'fig:a', 'fig:results', 'typst', text)).toEqual({
			text: 'See @fig:results. And @fig:ab, #ref(<fig:results>), #cite(<fig:results>) <fig:results> mail@fig:a @fig:a-b',
			count: 4
		});
	});
});

describe('renameSpec', () => {
	it('writes the new name literally, $ and all', () => {
		expect(rename('label', 'a$b', 'c$1', 'latex', '\\ref{a$b}').text).toBe('\\ref{c$1}');
	});

	it('knows which files hold uses in which language', () => {
		expect(['main.tex', 'x.STY', 'y.typ', 'refs.bib', 'notes.md'].map(useLanguageOf)).toEqual(['latex', 'latex', 'typst', null, null]);
	});
});

describe('renameSpec: definitions', () => {
	it('renames the definition with the uses, a label= key of a listing too', async () => {
		const loaded = await loadedPackages([{ name: 'listings', options: [] }]);
		const text =
			'\\label{a} \\ref{a} \\begin{lstlisting}[language=C, label=a]\n\\end{lstlisting} \\lstinputlisting[label={a}]{x.c} \\label{ab}';
		const spec = renameSpec('label', 'a', 'b', 'latex', {}, { definitions: true, loaded });
		expect(replaceInText(text, spec)).toEqual({
			text: '\\label{b} \\ref{b} \\begin{lstlisting}[language=C, label=b]\n\\end{lstlisting} \\lstinputlisting[label={b}]{x.c} \\label{ab}',
			count: 4
		});
	});

	it('renames a \\bibitem, the entry line of a .bib and the crossref to it, and no other field', () => {
		const spec = renameSpec('cite', 'knuth84', 'knuth1984', 'latex', {}, { definitions: true });
		expect(replaceInText('\\bibitem[Knuth(1984)]{knuth84} \\cite{knuth84}', spec).text).toBe(
			'\\bibitem[Knuth(1984)]{knuth1984} \\cite{knuth1984}'
		);
		const bib = '@book{knuth84,\n  title = {knuth84},\n  crossref = {knuth84}\n}\n@article{knuth84b,\n}';
		expect(replaceInText(bib, renameBibSpec('knuth84', 'knuth1984'))).toEqual({
			text: '@book{knuth1984,\n  title = {knuth84},\n  crossref = {knuth1984}\n}\n@article{knuth84b,\n}',
			count: 2
		});
	});

	it('renames a glossary entry at \\newglossaryentry, \\newacronym and every \\gls form', async () => {
		const loaded = await loadedPackages([{ name: 'glossaries', options: [] }]);
		const own = loadedReadings(loaded, ['glossary', 'acronym']);
		const text =
			'\\newglossaryentry{cpu}{name={CPU}} \\newacronym[longplural={x}]{cpu}{CPU}{unit} \\gls{cpu} \\glspl*{cpu} \\Gls[format=b]{cpu}[s] \\gls{cpus}';
		expect(replaceInText(text, renameSpec('glossary', 'cpu', 'proc', 'latex', own, { definitions: true }))).toEqual({
			text: '\\newglossaryentry{proc}{name={CPU}} \\newacronym[longplural={x}]{proc}{CPU}{unit} \\gls{proc} \\glspl*{proc} \\Gls[format=b]{proc}[s] \\gls{cpus}',
			count: 5
		});
	});
});

describe('renameSpec: a use over several lines', () => {
	it('renames a key list, a bare argument and a continuation line that TeX reads as one call', () => {
		const text = 'See \\cref{fig:b,\n  fig:a} and \\ref{\n fig:a\n} and \\citep[p.~3]{\n  lamport,\n  fig:a}';
		expect(rename('label', 'fig:a', 'fig:z', 'latex', text)).toEqual({
			text: 'See \\cref{fig:b,\n  fig:z} and \\ref{\n fig:z\n} and \\citep[p.~3]{\n  lamport,\n  fig:a}',
			count: 2
		});
		expect(rename('cite', 'lamport', 'lamport94', 'latex', text).text).toContain('{\n  lamport94,\n  fig:a}');
	});

	it('renames a label= key on a continuation line of the listing options', async () => {
		const loaded = await loadedPackages([{ name: 'listings', options: [] }]);
		const text = '\\begin{lstlisting}[language=C,\n  caption={A},\n  label=lst:a]\n\\end{lstlisting}';
		const spec = renameSpec('label', 'lst:a', 'lst:b', 'latex', {}, { definitions: true, loaded });
		expect(replaceInText(text, spec)).toEqual({ text: text.replace('lst:a', 'lst:b'), count: 1 });
	});
});

describe('renameSpec: verbatim text and comments', () => {
	const text = [
		'\\ref{a} % was \\ref{a}',
		'\\verb|\\ref{a}| \\lstinline!\\ref{a}! \\mintinline{tex}{\\ref{a}}',
		'\\begin{verbatim}',
		'\\ref{a}',
		'\\end{verbatim}',
		'\\begin{minted}[label=a]{tex}',
		'\\ref{a}',
		'\\end{minted}'
	].join('\n');

	it('leaves the words of verbatim commands and environments', () => {
		const out = rename('label', 'a', 'b', 'latex', text);
		expect(out.text.split('\n')).toEqual([
			'\\ref{b} % was \\ref{b}',
			'\\verb|\\ref{a}| \\lstinline!\\ref{a}! \\mintinline{tex}{\\ref{a}}',
			'\\begin{verbatim}',
			'\\ref{a}',
			'\\end{verbatim}',
			'\\begin{minted}[label=a]{tex}',
			'\\ref{a}',
			'\\end{minted}'
		]);
		expect(out.count).toBe(2);
	});

	it('renames commented-out code with the code', () => {
		expect(rename('label', 'a', 'b', 'latex', '% \\ref{a}\n\\ref{a} %\\cref{x,a}')).toEqual({
			text: '% \\ref{b}\n\\ref{b} %\\cref{x,b}',
			count: 3
		});
	});
});

describe('renameSpec: glossary key values', () => {
	it('renames the entries that parent=, see=, seealso= and alias= name, and no other value', async () => {
		const loaded = await loadedPackages([{ name: 'glossaries-extra', options: [] }]);
		const own = loadedReadings(loaded, ['glossary', 'acronym']);
		const text = [
			'\\newglossaryentry{gpu}{name={GPU}, description={like cpu},',
			'  parent=cpu, see={[see also]cpu,ram}, seealso={ram, cpu},',
			'  alias={cpu}, text={cpu}}',
			'\\newglossaryentry{cpu2}{name=cpu, parent=cpux}'
		].join('\n');
		const spec = renameSpec('glossary', 'cpu', 'proc', 'latex', own, { definitions: true, loaded });
		expect(replaceInText(text, spec)).toEqual({
			text: [
				'\\newglossaryentry{gpu}{name={GPU}, description={like cpu},',
				'  parent=proc, see={[see also]proc,ram}, seealso={ram, proc},',
				'  alias={proc}, text={cpu}}',
				'\\newglossaryentry{cpu2}{name=cpu, parent=cpux}'
			].join('\n'),
			count: 4
		});
	});
});

describe('renameBibSpec', () => {
	it('renames an entry head that runs over two lines', () => {
		expect(replaceInText('@book{\n  knuth84,\n  title = {x}\n}', renameBibSpec('knuth84', 'k'))).toEqual({
			text: '@book{\n  k,\n  title = {x}\n}',
			count: 1
		});
	});

	it('follows the key into crossref, xref, xdata and related as a whole list item', () => {
		const bib = [
			'@inbook{a, crossref = {knuth84}, xref = "knuth84", XDATA = {other, knuth84},',
			'  related = knuth84, title = {knuth84}, note = {knuth84x}, xdata = {knuth844, x}}'
		].join('\n');
		expect(replaceInText(bib, renameBibSpec('knuth84', 'k84'))).toEqual({
			text: [
				'@inbook{a, crossref = {k84}, xref = "k84", XDATA = {other, k84},',
				'  related = k84, title = {knuth84}, note = {knuth84x}, xdata = {knuth844, x}}'
			].join('\n'),
			count: 4
		});
	});
});
