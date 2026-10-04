import { describe, expect, it } from 'vitest';
import { renameSpec, useLanguageOf } from '$lib/workspace/edits/renameUses';
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
