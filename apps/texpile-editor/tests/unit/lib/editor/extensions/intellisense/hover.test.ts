// @vitest-environment jsdom
// hover.ts reaches mathlive, whose browser build touches HTMLElement as it loads
import { describe, it, expect } from 'vitest';
import { tokenAt, findLabelOffset, enclosingMathEnv, hoverCode } from '../../../../../../src/lib/languages/latex/intellisense/hover';
import { documentPackages } from '../../../../../../src/lib/languages/latex/intellisense/packages/loadedPackages';

describe('hover token detection (tokenAt)', () => {
	it('finds a macro token under the cursor', () => {
		const line = '\\textbf{hello}';
		const token = tokenAt(line, 3); // inside "textbf"
		expect(token).toEqual({ kind: 'macro', value: 'textbf', from: 0, to: 7 });
	});

	it('finds a package name inside \\usepackage{...}', () => {
		const line = '\\usepackage{hyperref}';
		const token = tokenAt(line, 15); // inside "hyperref"
		expect(token?.kind).toBe('package');
		expect(token?.value).toBe('hyperref');
	});

	it('finds a class name inside \\documentclass{...}', () => {
		const line = '\\documentclass{article}';
		const token = tokenAt(line, 18);
		expect(token?.kind).toBe('class');
		expect(token?.value).toBe('article');
	});

	it('finds the specific key under the cursor in a comma-separated \\cite{a,b,c}', () => {
		const line = '\\cite{knuth1984,lamport1994}';
		const token = tokenAt(line, line.indexOf('lamport') + 3);
		expect(token?.kind).toBe('citekey');
		expect(token?.value).toBe('lamport1994');
	});

	it('reads a cite key by the argument role, not by the word cite in the command name', () => {
		expect(tokenAt('\\citestyle{apa}', 12)?.kind).not.toBe('citekey');
		expect(tokenAt('\\bibentry{knuth84}', 14)?.kind).toBe('citekey');
	});

	it('finds a \\ref label', () => {
		const line = '\\ref{fig:one}';
		const token = tokenAt(line, 7);
		expect(token?.kind).toBe('label');
		expect(token?.value).toBe('fig:one');
	});

	it('reads the label argument by its role, so \\href is no label and \\hyperref[..] is', () => {
		expect(tokenAt('\\href{https://x.org}{t}', 10)?.kind).not.toBe('label');
		expect(tokenAt('\\hyperref[sec:a]{text}', 13)).toMatchObject({ kind: 'label', value: 'sec:a' });
	});

	it('offsets are in the document, and an argument may run over lines', () => {
		const text = 'preamble\n\\usepackage{amsmath,\n  hyperref}\n\\textbf{x}';
		expect(tokenAt(text, text.indexOf('textbf') + 2)).toMatchObject({ kind: 'macro', from: text.indexOf('\\textbf') });
		expect(tokenAt(text, text.indexOf('hyperref') + 2)).toMatchObject({
			kind: 'package',
			value: 'hyperref',
			from: text.indexOf('hyperref')
		});
	});

	it('reads no macro, key or package out of a comment or a verbatim body', () => {
		const text = '% \\usepackage{hyperref}\n\\begin{verbatim}\\ref{x}\\end{verbatim}';
		expect(tokenAt(text, text.indexOf('hyperref') + 2)).toBeNull();
		expect(tokenAt(text, text.indexOf('ref{x}') + 1)).toBeNull();
	});

	it('hovers the file of every graphic command in the package data', () => {
		const line = '\\includesvg[width=3cm]{figs/a}';
		expect(tokenAt(line, line.indexOf('figs') + 2)).toMatchObject({ kind: 'graphic', value: 'figs/a' });
	});

	it('finds an acro key like a glossary key', async () => {
		const loaded = await documentPackages('\\usepackage{acro}\n');
		expect(tokenAt('\\ac{cpu}', 5, loaded)).toEqual({ kind: 'glosskey', value: 'cpu', from: 4, to: 7 });
	});

	it('returns null over plain prose', () => {
		expect(tokenAt('just some words', 5)).toBeNull();
	});
});

describe('enclosingMathEnv', () => {
	it('takes the environment the label sits in, whatever a comment inside it writes', () => {
		const text = '\\begin{equation}\n a % \\end{equation}\n\\label{x}\n\\end{equation}\nafter';
		expect(enclosingMathEnv(text, text.indexOf('\\label'))).toBe(text.slice(0, text.indexOf('\nafter')));
	});

	it('is null outside a math environment', () => {
		const text = '\\begin{itemize}\\item \\label{x}\\end{itemize}';
		expect(enclosingMathEnv(text, text.indexOf('\\label'))).toBeNull();
	});
});

describe('hoverCode', () => {
	it('keeps a printed character off the name, even one that looks like an argument shape', () => {
		expect(hoverCode('textborn', '*', '*')).toEqual({ code: '\\textborn', note: '*' });
		expect(hoverCode('notbackslash', '\\\u2212', '\\\u2212')).toEqual({ code: '\\notbackslash', note: '\\\u2212' });
		expect(hoverCode('section', '*[]{}', undefined)).toEqual({ code: '\\section*[]{}', note: '' });
		expect(hoverCode('left(', '\\left( ... \\right)', undefined)).toEqual({ code: '\\left( ... \\right)', note: '' });
	});
});

describe('findLabelOffset', () => {
	it('finds the buffer offset of a \\label{...} definition', () => {
		const text = 'intro text\n\\section{X}\\label{sec:x}\nmore text';
		const offset = findLabelOffset(text, 'sec:x');
		expect(offset).toBe(text.indexOf('\\label{sec:x}'));
	});

	it('finds a definition written with a space or an optional argument, and skips a commented one', () => {
		const text = '% \\label{sec:x}\n\\label [short]{ sec:x }';
		expect(findLabelOffset(text, 'sec:x')).toBe(text.indexOf('\\label ['));
	});

	it('reads a changed text afresh and takes the first of two definitions', () => {
		const text = '\\label{sec:x} \\label{sec:x}';
		expect(findLabelOffset(text, 'sec:x')).toBe(0);
		expect(findLabelOffset(`pad ${text}`, 'sec:x')).toBe(4);
		expect(findLabelOffset(text, 'sec:y')).toBeNull();
	});

	it('returns null when the label is not defined', () => {
		expect(findLabelOffset('no labels here', 'sec:x')).toBeNull();
	});
});
