import { describe, it, expect } from 'vitest';
import { extractDocRefs, extractLabels } from '../../../../src/lib/languages/latex/parser/labels';

describe('extractLabels', () => {
	it('collects \\label keys across the document', () => {
		const tex = '\\section{Intro}\\label{sec:intro}\nText \\label{eq:main} more.\n\\begin{figure}\\label{fig:one}\\end{figure}';
		expect(extractLabels(tex).sort()).toEqual(['eq:main', 'fig:one', 'sec:intro']);
	});

	it('dedupes and ignores \\ref / \\cite', () => {
		const tex = '\\label{a}\\ref{a}\\cite{a}\\label{a}\\label{b}';
		expect(extractLabels(tex).sort()).toEqual(['a', 'b']);
	});

	it('returns [] for text with no labels', () => {
		expect(extractLabels('just some prose')).toEqual([]);
	});

	it('skips labels TeX never reads', () => {
		const tex = '\\iffalse\\label{dead}\\fi % \\label{commented}\n\\begin{verbatim}\\label{raw}\\end{verbatim}\\label {live}';
		expect(extractLabels(tex)).toEqual(['live']);
	});
});

describe('extractDocRefs bibitems', () => {
	it('cuts each entry at the next one and at the end of the list', () => {
		const tex =
			'\\begin{thebibliography}{9}\n\\bibitem[Kn84]{knuth} Knuth. Book.\n\\bibitem{lamport} Lamport.\n\\end{thebibliography}\nafter';
		expect(extractDocRefs(tex).bibitems).toEqual([
			{ key: 'knuth', body: ' Knuth. Book.\n' },
			{ key: 'lamport', body: ' Lamport.\n' }
		]);
	});
});
