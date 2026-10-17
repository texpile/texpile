import { describe, expect, it } from 'vitest';
import { maskVerbatim } from '$lib/draft/heuristics/verbatim';
import { daemonReady, repairForPreview } from '$lib/draft/heuristics/repairForPreview';
import { stripTexComments, splitParas } from '$lib/draft/heuristics/splitParas';

// Dynamic-catcode material is invisible to any static lexer: these prove the masking makes
// the balance/comment guards read \verb, \url and verbatim envs the way TeX scans them.
describe('verbatim masking', () => {
	it('blanks a \\verb body so its delimiter content stops counting', () => {
		const masked = maskVerbatim('a \\verb|{$%| b');
		expect(masked).toHaveLength('a \\verb|{$%| b'.length);
		expect(masked).not.toMatch(/[{$%]/);
		expect(masked.endsWith(' b')).toBe(true);
	});

	it('scans a \\url argument to the MATCHING brace, TeX-style', () => {
		expect(maskVerbatim('\\url{http://x/a%20{b}c} tail')).toBe('\\url{                 } tail');
	});

	it('keeps newlines inside an env body so line structure survives', () => {
		const s = '\\begin{verbatim}\n}{$\n\\end{verbatim}';
		expect(maskVerbatim(s).split('\n').length).toBe(3);
	});
});

describe('catcode-blind lexing fixes', () => {
	it('a brace inside \\verb no longer holds the dispatch', () => {
		expect(daemonReady('\\verb|{| and text')).toBe(true);
	});

	it('a % inside \\url no longer eats the closing brace', () => {
		expect(daemonReady('see \\url{http://x/a%20b} here')).toBe(true);
	});

	it('lstlisting body specials stay inert', () => {
		expect(daemonReady('\\begin{lstlisting}\nif (x { y $ z\n\\end{lstlisting}')).toBe(true);
	});

	it('repair leaves balanced verbatim untouched', () => {
		const s = 'a \\verb|$| b';
		expect(repairForPreview(s)).toBe(s);
	});

	it('strips a comment after a line break command ("\\\\%" comments; "\\%" does not)', () => {
		expect(stripTexComments('x \\\\% gone')).toBe('x \\\\');
		expect(stripTexComments('100\\% done')).toBe('100\\% done');
	});
});

describe('verbatim env capture', () => {
	it('LaTeX code inside a listing does not derail the env nesting scan', () => {
		const doc = ['\\begin{lstlisting}', '\\begin{itemize}', '\\end{lstlisting}', '', 'After paragraph.'].join('\n');
		const paras = splitParas(doc);
		expect(paras[0].env).toBe('lstlisting');
		expect(paras[0].text.endsWith('\\end{lstlisting}')).toBe(true);
		expect(paras[1].text).toBe('After paragraph.');
	});

	it('captures a starred verbatim twin by the package data, not a name list', () => {
		const paras = splitParas(['\\begin{Verbatim*}', '\\begin{itemize}', '\\end{Verbatim*}', '', 'After.'].join('\n'));
		expect(paras[0].env).toBe('Verbatim*');
		expect(paras[1].text).toBe('After.');
	});

	it('keeps a bibliography as one block while itemize stays per item', () => {
		const paras = splitParas(
			'\\begin{itemize}\n\\item One\n\\end{itemize}\n\n\\begin{thebibliography}{9}\n\\bibitem{a} A\n\\end{thebibliography}'
		);
		expect(paras[0]).toMatchObject({ text: 'One', wrap: 'itemize' });
		expect(paras[1].env).toBe('thebibliography');
	});
});
