import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

// regression guard: \def/\edef/\gdef/\xdef and \let/\futurelet are TeX primitives whose syntax
// (delimited parameter text, bare csname targets) MACRO_SIGNATURES cannot express. the bug: the
// primitive vanished while its definition got reprocessed as loose content (# escaped, body
// braces stripped), turning a working \def into a broken bare invocation. found via real corpus
// papers (1607.06450, 2106.09685, 2010.11929, 1711.05101, 2005.14165) failing to compile after
// regeneration.
function roundtrip(latex: string): string {
	const { doc } = treeToProseMirror(latex, {});
	return serializeToLatex(doc);
}

describe('\\def / \\let / \\makeatletter TeX-primitive round-trip', () => {
	it('preserves a simple zero-parameter \\def verbatim', () => {
		const src = '\\def\\R{{\\rm I\\hspace{-0.50ex}R}}';
		expect(roundtrip(src)).toContain(src);
	});

	it('preserves a \\def with delimited parameter text (#1 before a non-brace delimiter)', () => {
		const src = '\\def\\bea#1\\eea{\\begin{align}#1\\end{align}}';
		const out = roundtrip(src);
		expect(out).toContain(src);
		// the guarded corruption: \def vanishing while #1 gets escaped
		expect(out).not.toContain('\\#1');
	});

	it('preserves a cluster of adjacent (blank-line-free) \\def statements, each independently', () => {
		const src = '\\def\\R{{\\rm I\\hspace{-0.50ex}R}}\n\\def\\E{\\mathds{E}}\n\\def\\D{{\\mathcal{D}}}';
		const out = roundtrip(src);
		expect(out).toContain('\\def\\R{{\\rm I\\hspace{-0.50ex}R}}');
		expect(out).toContain('\\def\\E{\\mathds{E}}');
		expect(out).toContain('\\def\\D{{\\mathcal{D}}}');
	});

	it('preserves \\def\\name#1{...} used elsewhere in the body (math_commands.tex style)', () => {
		const src = '\\def\\figref#1{figure~\\ref{#1}}\n\\def\\twofigref#1#2{figures \\ref{#1} and \\ref{#2}}';
		const out = roundtrip(src);
		expect(out).toContain('\\def\\figref#1{figure~\\ref{#1}}');
		expect(out).toContain('\\def\\twofigref#1#2{figures \\ref{#1} and \\ref{#2}}');
	});

	it('preserves \\let with a bare target/source pair', () => {
		const src = '\\let\\@fnsymbol\\@arabic';
		expect(roundtrip(src)).toContain(src);
	});

	it('preserves \\let with an explicit = form', () => {
		const src = '\\let\\a=\\b';
		expect(roundtrip(src)).toContain(src);
	});

	it('preserves a \\makeatletter ... \\let ... \\makeatother cluster (the real corpus repro)', () => {
		const src = '\\setcounter{footnote}{0}\n\\makeatletter\n\\let\\@fnsymbol\\@arabic\n\\makeatother';
		const out = roundtrip(src);
		expect(out).toContain('\\makeatletter');
		expect(out).toContain('\\let\\@fnsymbol\\@arabic');
		expect(out).toContain('\\makeatother');
		// the guarded corruption: \@fnsymbol/\@arabic surviving as bare, directly-executed
		// control sequences instead of staying inside the \let assignment
		expect(out).not.toMatch(/(?<!\\let)\\@fnsymbol\\@arabic/);
	});

	it('does not corrupt an unrelated macro named similarly (sanity: normal macros still work)', () => {
		const src = '\\newcommand{\\foo}[1]{bar #1}\n\\foo{baz}';
		expect(roundtrip(src)).toContain('baz');
	});

	// regression guard: a \def/\let inside another macro's own {...} argument must be left
	// untouched. that argument is reconstructed by the generic printRaw/nodeToLatexString
	// printer, which never consults `_raw`; marking `_raw` there and splicing out "consumed"
	// siblings corrupts content that was already round-tripping correctly (corpus repro:
	// 1607.06450/macros.tex collapsing to a bare \edef).
	it('does not corrupt a \\def/\\let nested inside another macro argument', () => {
		const src = `\\renewcommand*\\env@matrix[1][\\arraystretch]{%
  \\edef\\arraystretch{#1}%
  \\hskip -\\arraycolsep
  \\let\\@ifnextchar\\new@ifnextchar
  \\array{*\\c@MaxMatrixCols c}}`;
		const out = roundtrip(src);
		expect(out).toContain('\\edef\\arraystretch{#1}');
		expect(out).toContain('\\hskip -\\arraycolsep');
		expect(out).toContain('\\let\\@ifnextchar\\new@ifnextchar');
		expect(out).toContain('\\array{*\\c@MaxMatrixCols c}');
	});
});

// a \def with a delimited parameter means every later `\bea ... \eea` call-site span is that
// macro's argument, usually math. the parser can't know that on its own (`\bea` is just an
// unknown zero-arg macro), so the span used to go through the prose path, escaping & and ^ and
// restructuring groups: invalid LaTeX once expanded into align (corpus repro: 1607.06450). the
// definition is the harvest signal; every call-site span is preserved verbatim as raw.
describe('delimited-parameter \\def call sites round-trip verbatim', () => {
	const DEF = '\\def\\bea#1\\eea{\\begin{align}#1\\end{align}}';
	const CALL = `\\bea x' =& f({\\Gain\\over\\sigma'}\\left(W x - \\mu \\right) + b) \\nonumber \\\\
=& f({\\Gain\\over\\sigma}\\left(Wx - \\mu \\right) + b). \\eea`;

	it('preserves the call-site span verbatim when the \\def is in the same file', () => {
		const out = roundtrip(`${DEF}\nSome text.\n\n${CALL}`);
		expect(out).toContain("{\\Gain\\over\\sigma'}"); // braces not restructured
		expect(out).toContain('=&'); // & not escaped to \&
		expect(out).not.toContain('=\\&');
		expect(out).not.toContain('\\^{}');
	});

	it('preserves the call-site span when the \\def lives in the preamble/projectMacros', () => {
		const { doc } = treeToProseMirror(CALL, { preamble: DEF });
		const out = serializeToLatex(doc);
		expect(out).toContain("{\\Gain\\over\\sigma'}");
		expect(out).toContain('=&');
		expect(out).not.toContain('=\\&');
	});

	it('an unmatched \\bea (no \\eea before the paragraph ends) is left alone', () => {
		const { doc } = treeToProseMirror('\\bea alone here\n\nNext paragraph.', { preamble: DEF });
		const out = serializeToLatex(doc);
		expect(out).toContain('Next paragraph.'); // nothing swallowed across the blank line
	});

	it('a commented-out definition does not register a pair', () => {
		const { doc } = treeToProseMirror('\\bea x &= y \\eea', { preamble: `%${DEF}` });
		const out = serializeToLatex(doc);
		// no pair harvested, so the normal prose path escapes &
		expect(out).toContain('\\&');
	});

	// pairs are harvested from the AST tokens of the definitions themselves, not a source-text
	// scan, so a definition merely quoted inside a verbatim environment can never register:
	// verbatim content is an opaque string in the AST, not macro nodes
	it('a definition quoted inside a verbatim environment does not register a pair', () => {
		const src = `\\begin{lstlisting}
\\def\\bea#1\\eea{\\begin{align}#1\\end{align}}
\\end{lstlisting}

\\bea x &= y \\eea`;
		const { doc } = treeToProseMirror(src, {});
		const out = serializeToLatex(doc);
		// no pair harvested, so the span takes the normal prose path (escaped &)
		expect(out).toContain('\\&');
		// and the quoted definition inside the listing stays byte-intact
		expect(out).toContain('\\def\\bea#1\\eea{\\begin{align}#1\\end{align}}');
	});
});
