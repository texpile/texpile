import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';
import { serializeToLatex } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

const parse = (s: string, preamble?: string): Node => LatexParser.latexToProseMirror(s, preamble ? { preamble } : {}).doc;
const rt = (s: string, preamble?: string) => serializeToLatex(parse(s, preamble));
function has(doc: Node, type: string): boolean {
	let f = false;
	doc.descendants((n) => {
		if (n.type.name === type) f = true;
		return !f;
	});
	return f;
}

describe('unknown command arguments keep their braces', () => {
	const STUDENTINFO = String.raw`\setstudentinfo
  {Jane Doe} % name
  {} % student number
  {PHYS 101} % course
  {Chapter 14 Critique} % experiment title
  {Professor Smith} % instructor
  {Example University} % affiliation
  {\today} % date
\makelabtitle{}`;

	it('heuristic: a class-defined setter keeps all its args AND its inter-arg comments', () => {
		const out = rt(STUDENTINFO);
		// every argument's braces survive (not flattened into loose text) …
		for (const arg of ['{Jane Doe}', '{PHYS 101}', '{Chapter 14 Critique}', '{\\today}']) expect(out).toContain(arg);
		expect(out).toContain('\\makelabtitle{}');
		expect(out).not.toMatch(/\\setstudentinfo\s+Jane Doe/);
		// … and so do the sameline comments (preserved verbatim, not stripped on save)
		for (const c of ['% name', '% course', '% date']) expect(out).toContain(c);
		const settled = rt(out);
		expect(rt(settled)).toBe(settled); // settles to a fixed point (no compounding)
	});

	it('preamble scan: a \\newcommand-defined command gets the exact signature', () => {
		const preamble = String.raw`\documentclass{article}
\newcommand{\setstudentinfo}[7]{#1}
\begin{document}`;
		const out = rt(String.raw`\setstudentinfo{Jane Doe}{}{PHYS 101}{Chapter 14}{Prof S}{ExampleU}{\today}`, preamble);
		expect(out).toContain('\\setstudentinfo{Jane Doe}{}{PHYS 101}{Chapter 14}{Prof S}{ExampleU}{\\today}');
	});

	it('does not over-grab across a blank line', () => {
		// \foo takes one group; the second group is a separate block and must not be swallowed
		const out = rt(String.raw`\foo{a}

{b} more`);
		expect(out).toContain('\\foo{a}');
		expect(out).not.toContain('\\foo{a}{b}');
	});

	it('does not infer args for known commands (textbf stays a bold mark, not raw)', () => {
		const doc = parse(String.raw`\textbf{hi} there`);
		expect(has(doc, 'inline_latex')).toBe(false); // textbf is still modeled as a mark
		expect(rt(String.raw`\textbf{hi} there`)).toContain('\\textbf{hi}');
	});

	it('never infers args inside math (no compounding of \\over / \\odot / accents / symbols)', () => {
		// in math these are followed by {...} that is not their argument; attaching it would
		// restructure the passthrough math and grow braces every round
		const src = String.raw`\begin{equation}
\Hidden^t = \actFunc\left[{\Gain\over\sigma^t}\odot\left(\Act^t - \mu^t\right) + \Bias \right] \qquad \hat{x} = \bar{y}
\end{equation}`;
		const r2 = rt(rt(src));
		const r3 = rt(r2);
		expect(r3).toBe(r2); // reaches a fixed point, no unbounded growth
		expect(r2).not.toContain('{-}'); // the minus is not brace-wrapped
		expect(r2).toContain('\\over'); // \over survives untouched
	});

	it('standalone comments are still preserved after the sameline strip', () => {
		const doc = parse(`A.

% kept
B.`);
		expect(has(doc, 'raw_latex')).toBe(true);
		expect(
			rt(`A.

% kept
B.`)
		).toContain('% kept');
	});
});

// regression guard: these three macros were absent from both the default DB and
// MACRO_SIGNATURES, so their arguments detached (corpus repros: 1512.03385, 2103.00020,
// 2006.11239; the verbatim layer hid the bug until a block regenerated)
describe('newly-registered macro signatures round-trip', () => {
	it('\\newcolumntype keeps its [n] arg-count and {body} intact (array package)', () => {
		const src = String.raw`\newcolumntype{x}[1]{>{\centering}p{#1pt}}`;
		expect(rt(src)).toContain(src);
	});

	it('\\captionof keeps both mandatory args intact (caption package)', () => {
		const src = String.raw`\captionof{figure}{A caption text.}`;
		expect(rt(src)).toContain(src);
	});

	it('\\iftoggle keeps all three groups intact when used as ordinary body content (etoolbox)', () => {
		// \iftoggle as an \includegraphics filename arg is a narrower, separately documented gap
		// (see the KNOWN GAP comment on the includegraphics handler): that handler flattens its
		// filename arg with getTextContent regardless of this signature
		const src = String.raw`\iftoggle{hq}{high quality}{low quality} figure.`;
		expect(rt(src)).toContain('\\iftoggle{hq}{high quality}{low quality}');
	});
});

// a group directly adjacent to a raw macro chip is (an argument to) that macro's expansion:
// `\rot{Finetune}` where \rot is a 0-arg \newcommand for \rotatebox{90}, the optional-arg idiom
// \answerYes{See ...}, the control-word terminator \oursfull{}s. flattening the group dropped
// its braces, fusing the text onto the control word (`\rotFinetune`, undefined, fatal) or
// silently changing the render (corpus repros: 2103.00020, 2201.11903, 2010.11929). the group
// is now preserved verbatim, with a serializer-side space guard as a backstop against fusion.
describe('a group adjacent to a raw macro chip keeps its braces (no token fusion)', () => {
	it('0-arg macro whose expansion takes the group (\\rot{Finetune})', () => {
		const preamble = String.raw`\documentclass{article}
\newcommand*\rot{\rotatebox{90}}
\begin{document}`;
		const out = serializeToLatex(LatexParser.latexToProseMirror(String.raw`\rot{Finetune} & SOTA`, { preamble }).doc);
		expect(out).toContain('\\rot{Finetune}');
		expect(out).not.toContain('\\rotFinetune');
	});

	it('optional-arg macro followed by a brace group of prose (\\answerYes{See ...})', () => {
		const preamble = String.raw`\documentclass{article}
\newcommand{\answerYes}[1][]{\textcolor{blue}{[Yes] #1}}
\begin{document}`;
		const out = serializeToLatex(LatexParser.latexToProseMirror(String.raw`\answerYes{See section 3.}`, { preamble }).doc);
		expect(out).toContain('\\answerYes{See section 3.}');
		expect(out).not.toContain('\\answerYesSee');
	});

	it('empty-group control-word terminator (\\oursfull{}s)', () => {
		const preamble = String.raw`\documentclass{article}
\newcommand{\oursfull}{ViT-L/16}
\begin{document}`;
		const out = serializeToLatex(LatexParser.latexToProseMirror(String.raw`\oursfull{}s overfit more.`, { preamble }).doc);
		expect(out).toContain('\\oursfull{}s');
		expect(out).not.toContain('\\oursfulls');
	});

	it('kernel macro registered signature-less in the default DB (\\enlargethispage{-15\\baselineskip})', () => {
		const out = rt(String.raw`Some prose here.
\enlargethispage{-15\baselineskip}
More prose.`);
		expect(out).toContain('\\enlargethispage{-15\\baselineskip}');
	});

	it('reaches a fixed point (the preserved group is stable across saves)', () => {
		const preamble = String.raw`\documentclass{article}
\newcommand{\answerYes}[1][]{x #1}
\begin{document}`;
		const r1 = serializeToLatex(LatexParser.latexToProseMirror(String.raw`\answerYes{See it.}`, { preamble }).doc);
		const r2 = serializeToLatex(LatexParser.latexToProseMirror(r1, { preamble }).doc);
		expect(r2).toBe(r1);
	});
});

// arity inference must never fire for table rules: pandas-exported tables start a header row
// with an empty group (`\toprule` then `{} & ...`), which inference read as "\toprule takes 1
// arg", corrupting every rule site file-wide (`\toprule{&}` is fatal). same class as the old
// `\hline{convolution}` failure. corpus repros: 2010.11929, 1409.4842, 1512.00567.
describe('table rules are exempt from arity inference', () => {
	it('an empty leading header cell {} does not give \\toprule an argument file-wide', () => {
		const src = `\\begin{table}[h]
\\begin{tabular}{ll}
\\toprule
{} & Epochs \\\\
\\midrule
a & 1 \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\begin{table}[h]
\\begin{tabular}{ll}
\\toprule
Models & Dataset \\\\
\\midrule
b & 2 \\\\
\\bottomrule
\\end{tabular}
\\end{table}`;
		const out = rt(src);
		expect(out).not.toMatch(/\\toprule\{/);
		expect(out).not.toMatch(/\\midrule\{/);
		expect(out).toContain('Models & Dataset');
	});
});

describe('a call kept verbatim for its comment', () => {
	it('keeps the group after a command without arguments inside a mark', () => {
		expect(rt('As \\textbf{\\newcite{Akbik}} shows.', '\\newcommand\\newcite{\\citet}')).toContain('\\textbf{\\newcite{Akbik}}');
	});

	it.each(['\\author{A}\n', ''])('keeps the call after it on its own line', (before) => {
		const tex = `\\documentclass{article}\n\\newcommand{\\aff}[1]{#1}\n\\begin{document}\n${before}\\aff{Dept}%\n\\aff{Kavli}\n\\end{document}\n`;
		const parsed = parseLatexFile(tex);
		expect(serializeLatexFile(parsed, withoutOrigins(parsed.doc))).toContain('\\aff{Dept}%\n\\aff{Kavli}\n');
	});

	it('leaves the cell break after it in a table row', () => {
		const row = 'A & \\up{1} % one\n& \\up{2} % two\n& 3 \\\\';
		const out = rt(`\\newcommand{\\up}[1]{#1}\n\\begin{tabular}{cccc}\n${row}\n\\end{tabular}`);
		expect(out).toContain('\\up{2} % two\n');
		expect(out.match(/&/g)).toHaveLength(row.match(/&/g)!.length);
	});

	it('still takes the groups its other uses give it', () => {
		expect(rt('See \\foo[o]{x}{y} here.\n\n\\foo{a} % c\n[q]{-}{-} more\n')).toContain('[q]{-}{-} more');
	});
});
