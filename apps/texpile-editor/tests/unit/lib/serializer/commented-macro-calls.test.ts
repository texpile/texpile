import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

const parse = (s: string): Node => treeToProseMirror(s, {}).doc;
const rt = (s: string) => serializeToLatex(parse(s));

describe('frontmatter macro calls with sameline comments are preserved verbatim', () => {
	// a custom setter whose argument groups carry trailing comments. previously the comments were
	// stripped and the call re-emitted collapsed onto one line; now the whole call is captured
	// verbatim from source, comments and layout intact.
	const SRC = String.raw`\setstudentinfo
  {Jane Doe} % name
  {} % student number (leave {} if none)
  {PHYS 101} % course
  {Chapter 14 Critique} % experiment title
  {Professor Smith} % instructor (leave {} if none)
  {Example University} % affiliation (leave {} if none)
  {\today} % date (leave {} for today's date)
\makelabtitle{}`;

	it('keeps every sameline comment', () => {
		const out = rt(SRC);
		for (const c of [
			'% name',
			'% student number',
			'% course',
			'% experiment title',
			'% instructor',
			'% affiliation',
			'% date (leave {} for today'
		]) {
			expect(out).toContain(c);
		}
	});

	it('keeps the argument values and does not collapse them onto one line', () => {
		const out = rt(SRC);
		expect(out).toContain('{Jane Doe}');
		expect(out).toContain('{PHYS 101}');
		expect(out).toContain('{\\today}');
		expect(out).toContain('\\makelabtitle{}');
		// not flattened: each commented arg is still on its own line
		expect(out).toContain('{Jane Doe} % name\n');
		// never produces the old collapsed form
		expect(out).not.toContain('{Jane Doe}{}');
	});

	it('reaches a fixed point (no compounding across saves)', () => {
		const r1 = rt(SRC);
		const r2 = rt(r1);
		expect(rt(r2)).toBe(r2); // settled (R2 === R3)
	});

	it('does NOT disturb a plain (un-commented) call — args still attach normally', () => {
		// no interleaved comments, so the normal signature/heuristic path applies
		const out = rt(String.raw`\setstudentinfo{Jane Doe}{}{PHYS 101}{\today}`);
		expect(out).toContain('\\setstudentinfo{Jane Doe}{}{PHYS 101}{\\today}');
	});

	it('leaves a single-argument commented macro to the normal path (no false capture)', () => {
		// one trailing comment, but it follows prose, not an interleaved arg run: unchanged behaviour
		const out = rt(String.raw`Some text \emph{x} % trailing note
more text`);
		expect(out).toContain('\\emph{x}'); // through the normal path, and keeping the command the file wrote
	});

	// regression guard: a commented macro call nested inside a RAW_WHOLESALE_ARG_MACROS macro's
	// own argument (e.g. \renewcommand's body) must not be captured this way. that argument is
	// reconstructed by the generic printRaw/nodeToLatexString printer, which never consults
	// `_raw`; capturing there deletes the "consumed" comment+groups from that printer's view
	// (corpus repro: 1607.06450/macros.tex collapsing to a bare \arraystretch).
	it('does not corrupt a commented call nested inside a \\renewcommand body', () => {
		const src = `\\makeatletter
\\renewcommand*\\env@matrix[1][\\arraystretch]{%
  \\edef\\arraystretch{#1}%
  \\hskip -\\arraycolsep
  \\let\\@ifnextchar\\new@ifnextchar
  \\array{*\\c@MaxMatrixCols c}}
\\makeatother`;
		const out = rt(src);
		expect(out).toContain('\\edef\\arraystretch{#1}');
		expect(out).toContain('\\hskip -\\arraycolsep');
		expect(out).toContain('\\let\\@ifnextchar\\new@ifnextchar');
		expect(out).toContain('\\array{*\\c@MaxMatrixCols c}');
	});

	// companion: the restriction must be narrow. a table cell reached via \multicolumn's own
	// argument genuinely is re-walked through the converter's structural dispatch, so an unknown
	// macro nested there must still get help attaching its args. a blanket "stop recursing into
	// any macro's args" attempt regressed exactly this.
	it('still helps an unknown macro nested inside \\multicolumn/\\multirow table cells', () => {
		const out = rt(String.raw`\begin{tabular}{ll}
\multicolumn{1}{c}{\makecell{RoBERTa \\ base}} & x \\
\end{tabular}`);
		expect(out).toContain('\\makecell{RoBERTa');
		expect(out).not.toContain('\\makecellRoBERTa');
	});
});
