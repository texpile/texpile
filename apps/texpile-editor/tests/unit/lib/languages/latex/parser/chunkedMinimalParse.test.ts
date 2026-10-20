// Oracle: the chunked tokenizer must produce exactly what upstream's whole-string parse does.
// Inert corpus half unless CORPUS_DIR points at a folder of .tex files.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseMinimal as upstreamMinimal } from '@unified-latex/unified-latex-util-parse';
import { parseMinimal } from '$lib/languages/latex/parser/pegMinimal';
import { parseMinimalChunked } from '$lib/languages/latex/parser/chunkedMinimalParse';
import { parseLatex } from '$lib/languages/latex/parser/parser';
import { tokenizerNames } from '$lib/languages/latex/parser/signatures/tokenizerNames';

vi.mock('$lib/languages/latex/parser/pegMinimal', async (importOriginal) => {
	const m = await importOriginal<typeof import('$lib/languages/latex/parser/pegMinimal')>();
	return { ...m, parseMinimal: vi.fn(m.parseMinimal) };
});

// the same pipeline with upstream's tokenizer in place of the vendored one
function upstreamTokenized(src: string): string {
	vi.mocked(parseMinimal).mockImplementationOnce((text: string) => upstreamMinimal(text));
	return JSON.stringify(parseLatex(src));
}

// every construct the tokenizer scans forward through, laid across blank lines
const BODY = [
	'\\section{Intro}',
	'',
	'Plain paragraph one with $x+y$ inline math and \\emph{emph}.',
	'',
	'  Indented paragraph after a blank line stays with the parbreak.',
	'',
	'% a comment line right after a blank line',
	'Text after the comment.',
	'',
	'\\begin{itemize}',
	'\\item first',
	'',
	'\\item second, after a blank line inside the environment',
	'',
	'\\end{itemize}',
	'',
	'$$',
	'',
	'a = b',
	'',
	'$$',
	'',
	'\\[',
	'',
	'c = d \\text{ with $e$ inside }',
	'',
	'\\]',
	'',
	'\\( f',
	'',
	'= g \\)',
	'',
	'{ a group',
	'',
	'spanning a blank line }',
	'',
	'\\begin{verbatim}',
	'raw \\begin{itemize} $ { %',
	'',
	'still raw',
	'\\end{verbatim}',
	'',
	'\\begin{lstlisting}[language=C]',
	'int x; { $',
	'',
	'more',
	'\\end{lstlisting}',
	'',
	'\\begin{minted}{python}',
	'def f(): pass',
	'',
	'\\end{minted}',
	'',
	'Verb \\verb|{ $ \\begin{x}| and \\verbatiminput{file} and \\lstinline[a]{ {x} } and \\mintinline{c}|y|.',
	'',
	'\\verb+ spans',
	'',
	'a blank line+ and \\verbo takes o as its delimiter.',
	'',
	'\\begin{equation}',
	'',
	'e = f $ g',
	'',
	'\\end{equation}',
	'',
	'\\begin{align*}',
	'a &= b \\\\',
	'',
	'c &= d',
	'\\end{align*}',
	'',
	'Comment before blank % trailing',
	'',
	'Tail paragraph one.',
	''
].join('\n');

const UNMATCHED = [
	'An unmatched { brace late in the document',
	'',
	'so that everything after it stays in one chunk.',
	'',
	'Last paragraph.',
	''
].join('\n');

// the serialized trees run to megabytes; a full diff would stall the reporter
function firstDifference(ours: string, upstream: string): string | null {
	if (ours === upstream) return null;
	let i = 0;
	while (i < ours.length && ours[i] === upstream[i]) i++;
	return `at ${i}\n ours:     ${ours.slice(Math.max(0, i - 200), i + 120)}\n upstream: ${upstream.slice(Math.max(0, i - 200), i + 120)}`;
}

// asserts equality with the whole parse; returns the texts handed to the tokenizer
function same(source: string, chunkBytes: number): string[] {
	vi.mocked(parseMinimal).mockClear();
	const chunked = JSON.stringify(parseMinimalChunked(source, chunkBytes));
	const calls = vi.mocked(parseMinimal).mock.calls.map((c) => c[0]);
	expect(firstDifference(chunked, JSON.stringify(parseMinimal(source, tokenizerNames())))).toBeNull();
	return calls;
}

// the document path parses the head behind a synthetic \end{document}; only the flat parse ever
// tokenizes the start of the file without it
const viaDocumentPath = (calls: string[]) => !calls.some((s) => s.startsWith('\\documentclass') && !s.endsWith('\\end{document}'));

describe('parseMinimalChunked', () => {
	it('matches the whole parse with a cut attempted at nearly every paragraph', () => {
		expect(same(BODY + UNMATCHED, 48).length).toBeGreaterThan(10);
	});

	it('matches with CRLF line endings', () => {
		expect(same((BODY + UNMATCHED).replace(/\n/g, '\r\n'), 48).length).toBeGreaterThan(10);
	});

	it('matches on a whole file, chunking inside the document environment', () => {
		const preamble = '\\documentclass{article}\n% \\begin{document} in a comment\n\\newcommand{\\x}{y}\n\n';
		const trailer = '\n\nleft over after the end\n\n% and a comment\n';
		const wrapped = (open: string, close: string) => preamble + open + BODY + BODY + close + trailer;
		expect(viaDocumentPath(same(wrapped('\\begin{document}', '\\end{document}'), 48))).toBe(true);
		expect(viaDocumentPath(same(wrapped('\\begin{document} % same-line comment', '\\end{document}'), 48))).toBe(true);
		// closed early: the trailer is body, and what follows the real closer is outside
		expect(viaDocumentPath(same(wrapped('\\begin{document}', '\\end{document}\n\nAfter.\n\n\\end{document}'), 48))).toBe(true);
		// never closed, and closed only inside a group: no document environment to rebuild
		expect(viaDocumentPath(same(wrapped('\\begin{document}', ''), 48))).toBe(false);
		expect(viaDocumentPath(same(wrapped('\\begin{document}', '{\\end{document}}'), 48))).toBe(false);
		// a bare \begin in the body means the environment never closes there either
		expect(same(wrapped('\\begin{document}\n\n\\begin x', '\\end{document}'), 48).length).toBeGreaterThan(1);
	});

	it('matches when an opener in one chunk is closed chunks later, or never', () => {
		const P = 'Filler paragraph with enough words to pass a cut point comfortably.\n\n';
		// the preamble idiom: bare in the whole parse too, so it must not stop the chunking
		const idiom = '\\newcommand{\\bea}{\\begin{eqnarray}}\n\\newcommand{\\eea}{\\end{eqnarray}}\n\n';
		expect(same(idiom + BODY + BODY, 48).length).toBeGreaterThan(10);
		const docs = [
			'Open { here\n\n' + P + P + 'close } here\n\n' + P,
			'Open { here\n\n' + P + '{ nested\n\n' + P + '} closes the nested one\n\n' + P + '} closes the first\n\n' + P,
			'A lone $ here\n\n' + P + P + 'and $ another\n\n' + P,
			'Text \\verb+open\n\n' + P + 'plus + closes\n\n' + P,
			'\\verbatiminput{fig}\n\n' + 'no letter here\n\n' + 'more text\n\n' + 'an a\n\n' + P,
			'\\[ open\n\n' + P + 'inside $ \\] $ math\n\n' + P,
			'\\( open\n\n' + P + 'closer \\) here\n\n' + P,
			'\\begin{align} open\n\n' + P + 'inside $ \\end{align} $ math\n\n' + P,
			'\\begin{itemize}\n\n' + P + '\\begin{itemize}\n\n' + P + '\\end{itemize}\n\n' + P + '\\end{itemize}\n\n' + P,
			'\\begin{center}\n\n' + P + '\\end{center}\n\n' + P + '\\end{center}\n\n' + P,
			'\\begin{verbatim}\n\n' + P + P + '\\end{verbatim}\n\n' + P,
			'\\begin{lstlisting}[x]\n\n' + P + '\\end{lstlisting}\n\n' + P,
			'\\lstinline|open\n\n' + P + 'x|\n\n' + P,
			'\\lstinline[a]{open\n\n' + P + 'x}\n\n' + P,
			'\\mintinline{c}|open\n\n' + P + 'x|\n\n' + P,
			// user macros of the same names, bare in the whole parse too
			'\\newcommand{\\mint}{m}\n\n' + P + '\\mint\n\n' + P + P,
			'\\documentclass{x}\n\\begin{document}\n\n' + P + '\\begin{document}\n\n' + P + '\\end{document}\n\n' + P
		];
		for (const doc of docs) same(doc, 48);
	});

	it('the full pipeline matches upstream on a multi-chunk document', () => {
		let doc = '';
		for (let i = 0; i < 60; i++) doc += BODY.replace('Intro', `Part ${i}`);
		doc += UNMATCHED;
		vi.mocked(parseMinimal).mockClear();
		const ours = JSON.stringify(parseLatex(doc));
		// the vendored tokenizer takes the whole string in one call; the chunked one is for a
		// tokenizer whose memo grows with the input
		expect(vi.mocked(parseMinimal).mock.calls.length).toBe(1);
		expect(firstDifference(ours, upstreamTokenized(doc))).toBeNull();
	});
});

describe('the vendored tokenizer', () => {
	// without a memo every failed environment was scanned again by each one before it: 5 s for these 9 lines
	it('reads unclosed \\begin inside groups like upstream, at once', () => {
		const src = Array.from({ length: 9 }, (_, i) => `\\newcommand{\\b${'abcdefghi'[i]}}{\\begin{lemm}\\begin{sl}}`).join('\n');
		const start = performance.now();
		const ours = JSON.stringify(parseLatex(src));
		expect(performance.now() - start).toBeLessThan(1000);
		expect(firstDifference(ours, upstreamTokenized(src))).toBeNull();
	});

	it.each([
		['\\[', '\\[ a '.repeat(16)],
		['\\(', '\\( a '.repeat(16)],
		['\\lstinline[', '\\lstinline[ x '.repeat(14)],
		['a display closed by a macro', '\\newcommand{\\edm}{\\]}\n' + 'Text \\[ x_i = 1 \\edm\n\n'.repeat(12)]
	])('reads unclosed %s like upstream, at once', (_, src) => {
		const start = performance.now();
		const ours = JSON.stringify(parseLatex(src));
		expect(performance.now() - start).toBeLessThan(1000);
		expect(firstDifference(ours, upstreamTokenized(src))).toBeNull();
	});
});

const CORPUS = process.env.CORPUS_DIR;

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile() && entry.name.endsWith('.tex')) out.push(full);
	}
	return out;
}

// null where upstream throws (its list cleanup on \smallskip before a blank line)
function upstreamParse(src: string): string | null {
	try {
		return upstreamTokenized(src);
	} catch {
		return null;
	}
}

describe.skipIf(!CORPUS)('chunked parse over the corpus', () => {
	it(
		'matches upstream on every file, at the shipped chunk size and at 4 KB',
		async () => {
			const bad: string[] = [];
			for (const file of walk(CORPUS!)) {
				await new Promise((r) => setTimeout(r, 0)); // let the worker answer the reporter between files
				vi.mocked(parseMinimal).mockClear(); // the spy would otherwise retain every AST
				const src = fs.readFileSync(file, 'utf8');
				const ours = JSON.stringify(parseLatex(src));
				const upstream = upstreamParse(src);
				const pipeline = upstream === null ? null : firstDifference(ours, upstream);
				if (pipeline) bad.push(`${file} (pipeline) ${pipeline}`);
				const minimal = firstDifference(
					JSON.stringify(parseMinimalChunked(src, 4096)),
					JSON.stringify(parseMinimal(src, tokenizerNames()))
				);
				if (minimal) bad.push(`${file} (4 KB) ${minimal}`);
			}
			expect(bad).toEqual([]);
		},
		30 * 60 * 1000
	);
});
