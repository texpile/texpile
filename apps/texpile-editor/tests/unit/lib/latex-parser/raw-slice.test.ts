import { describe, it, expect } from 'vitest';
import { latexToProseMirror } from '../../../../src/lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

// "demote to raw" must mean copy the original source bytes, not re-print the parse tree:
// unified-latex's printRaw emits a blank line after own-line comments, and a blank line is a
// \par token. inside a non-\long macro argument (\author, \institute) that's a fatal runaway
// argument; in body prose it silently changes a paragraph break. corpus repros: 1512.00567,
// 1608.06993, 1505.04597. these tests exercise the deterministic path directly
// (latexToProseMirror alone records no parse origins, so no verbatim short-circuit masks the raw node).
function rt(src: string): string {
	const { doc } = latexToProseMirror(src, {});
	return serializeToLatex(doc);
}

describe('raw fallback slices original source bytes (not printRaw reconstruction)', () => {
	const AUTHOR = `\\author{Christian Szegedy\\\\
Google Inc.\\\\
{\\tt\\small szegedy@google.com}
% For a paper whose authors are all at the same institution,
% omit the following lines up until the closing bracket.
% Additional authors and addresses can be added with \\and,
% just like the second author.
\\and
Vincent Vanhoucke\\\\
{\\tt\\small vanhoucke@google.com}
}`;

	it('preserves a multi-line \\author block with own-line comments byte-for-byte', () => {
		expect(rt(AUTHOR)).toContain(AUTHOR);
	});

	it('never injects a blank line after an own-line comment (blank line = \\par = fatal in \\author)', () => {
		const out = rt(AUTHOR);
		expect(out).not.toMatch(/%[^\n]*\n[ \t]*\n/);
	});

	it('preserves an llncs-style \\institute block (the other real-corpus failure shape)', () => {
		const src = `\\institute{Computer Science Department, University of Freiburg, Germany\\\\
\\email{ronneber@informatik.uni-freiburg.de},\\\\ WWW home page:
\\texttt{http://lmb.informatik.uni-freiburg.de/}
}`;
		const out = rt(src);
		expect(out).toContain(src);
		expect(out).not.toMatch(/\n[ \t]*\n[^\\]*\\texttt/); // no blank line inserted mid-argument
	});

	it('reaches a fixed point (slice re-parses to the same slice)', () => {
		const r1 = rt(AUTHOR);
		const r2 = rt(r1);
		expect(rt(r2)).toBe(r2);
	});

	it('still strips a swallowed trailing \\par from a greedy unknown macro (no compounding)', () => {
		// the \par-strip guard predates slicing and must survive it: a greedy macro whose
		// heuristic-attached args swallowed the previous save's \par must not re-emit it
		// (it would compound every round-trip)
		const out = rt('\\unknowncmd{arg} \\par\nNext paragraph.');
		expect(out).toContain('\\unknowncmd{arg}');
		expect(out).not.toContain('\\unknowncmd{arg} \\par \\par');
	});

	it('a verbatim environment with own-line comments round-trips byte-for-byte', () => {
		const src = `\\begin{tikzpicture}
% draw the main node
\\node (a) at (0,0) {A};
% and the edge
\\draw (a) -- (1,1);
\\end{tikzpicture}`;
		expect(rt(src)).toContain(src);
	});
});

// companion regression at the block span capture layer: a block whose last positioned token
// sits inside an attached macro argument had a truncated span (the closing delimiter is
// openMark/closeMark metadata with no positioned node), so the closer landed in the inter-block
// gap and was lost the moment a slice-less block followed. the fix repairs block extents over
// the arg tail (repairExtentTail) and gives _raw capture blocks their literal slice as capture
// extent, keeping the verbatim chain contiguous.
describe('block span capture includes attached-arg closers (math_commands.tex shape)', () => {
	const FILE = `\\documentclass{article}
\\begin{document}
\\newcommand{\\captiond}{{\\em (d)}}

\\newcommand{\\newterm}[1]{{\\bf #1}}


\\def\\figref#1{figure~\\ref{#1}}
\\def\\Figref#1{Figure~\\ref{#1}}

Some prose.
\\end{document}
`;

	it('untouched save is byte-identical', () => {
		const parsed = parseLatexFile(FILE);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(FILE);
	});

	it("the \\newcommand block's final closer survives even when a neighbouring block regenerates", () => {
		const parsed = parseLatexFile(FILE);
		// edit the prose block so it regenerates; the \newcommand and \def blocks stay pristine
		// and the \newcommand block's verbatim slice must be complete
		const doc = parsed.doc;
		const last = doc.child(doc.childCount - 1);
		const edited = last.type.create(last.attrs, last.type.schema.text('Edited prose.'));
		const kids = [];
		for (let i = 0; i < doc.childCount - 1; i++) kids.push(doc.child(i));
		kids.push(edited);
		const out = serializeLatexFile(parsed, doc.copy(doc.type.schema.nodes.doc.create(null, kids).content));
		expect(out).toContain('\\newcommand{\\newterm}[1]{{\\bf #1}}');
		expect(out).toContain('\\def\\figref#1{figure~\\ref{#1}}');
		expect(out).toContain('Edited prose.');
	});
});

describe('the closers after a call kept as a chip', () => {
	it('keeps those of a call its argument ends in', () => {
		expect(rt('\\author{J.~L\\footnotemark[2] \\and C.~S\\footnotemark[2]}\n\nText.')).not.toContain(']}]}');
	});

	it('slices a call whole when a call in its argument is kept verbatim for its comment', () => {
		const label = '\\put(100,1180){%\n\\special{ps: gsave}%\n\\cstack{F(k)}%\n\\special{ps: grestore}%\n}';
		expect(rt(`${label}%\n\\put(2,3){\\cjust{k}}%\n`)).toContain(label);
	});

	it('keeps the bracket after a command the usage guess gave a bare token', () => {
		const src = 'A \\left( z \\left[\\prod \\Delta^\\delta \\right] \\bX\\right) .\n\\delta {\\bf C} \\left(\n';
		expect(rt(src)).toContain('\\right] \\bX');
	});
});

describe('biblatex resources in the body', () => {
	it('keeps \\addbibresource as written', () => {
		expect(rt('% Add bibliography\n\\addbibresource{bibliography.bib}\n')).toContain('\\addbibresource{bibliography.bib}');
	});
});
