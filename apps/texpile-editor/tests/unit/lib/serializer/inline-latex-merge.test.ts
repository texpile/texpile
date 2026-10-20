import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '../../../../src/lib/languages/latex/serializer/latexSerializer';

const parse = (s: string): Node => LatexParser.latexToProseMirror(s, {}).doc;
const rt = (s: string) => serializeToLatex(parse(s));
function nodesOfType(doc: Node, type: string): Node[] {
	const out: Node[] = [];
	doc.descendants((n) => {
		if (n.type.name === type) out.push(n);
		return true;
	});
	return out;
}

// a center block of only inline-LaTeX fragments (no \\), like the user's title block
const CENTER =
	'\\begin{center}\n\\vspace*{1em}\n{\\huge\\bfseries\\guidetitle}\n{\\large \\guidesubtitle}\n\\guidedate\n\\vspace{2cm}\n\\end{center}';

// the user's real case: lines separated by \vspace{\baselineskip} (parsed as hard_breaks).
// still pure raw LaTeX, so it must collapse to one raw_latex block.
const CENTER_BREAKS = String.raw`\begin{center}
\vspace*{0.5cm} {\huge\bfseries\guidetitle}\vspace{\baselineskip}
{\large\guidecourse}\vspace{\baselineskip}
\guidedate \vspace{1.5cm} \par
\end{center}`;

describe('inline LaTeX merge + block promotion', () => {
	it('merges adjacent inline LaTeX into one node (whitespace baked, single space)', () => {
		// prose after keeps it a paragraph (not promoted) so we observe the merge directly
		const doc = parse('\\foo \\baz text');
		const inl = nodesOfType(doc, 'inline_latex');
		expect(inl).toHaveLength(1);
		expect(inl[0].textContent).toBe('\\foo \\baz');
		expect(nodesOfType(doc, 'raw_latex')).toHaveLength(0);
		expect(doc.textContent).toContain('text'); // prose preserved
	});

	it('promotes an all-inline-LaTeX block to a single raw_latex block (no inline_latex left)', () => {
		const doc = parse(CENTER);
		expect(nodesOfType(doc, 'environment')).toHaveLength(1); // the center env
		expect(nodesOfType(doc, 'inline_latex')).toHaveLength(0); // all fused + promoted
		const raw = nodesOfType(doc, 'raw_latex');
		expect(raw).toHaveLength(1);
		// all five fragments present, in order
		expect(raw[0].textContent).toContain('\\vspace*{1em}');
		expect(raw[0].textContent).toContain('\\guidetitle');
		expect(raw[0].textContent).toContain('\\guidedate');
		expect(raw[0].textContent).toContain('\\vspace{2cm}');
	});

	it('keeps mixed prose + inline as a paragraph, with separate inline_latex (prose breaks the run)', () => {
		const doc = parse('Hello \\foo world \\bar done');
		expect(nodesOfType(doc, 'raw_latex')).toHaveLength(0); // not promoted
		expect(nodesOfType(doc, 'inline_latex')).toHaveLength(2); // \foo and \bar stay separate
	});

	it('does NOT merge two chips across a \\\\ (hard_break breaks the merge run)', () => {
		// prose keeps it a paragraph; the two chips must not fuse into one
		const doc = parse('done \\foo \\\\ \\bar end');
		expect(nodesOfType(doc, 'inline_latex')).toHaveLength(2);
		expect(nodesOfType(doc, 'hard_break')).toHaveLength(1);
		expect(nodesOfType(doc, 'raw_latex')).toHaveLength(0);
	});

	it('collapses an all-raw center (chips split by \\vspace{\\baselineskip}) to ONE raw_latex block', () => {
		const doc = parse(CENTER_BREAKS);
		expect(nodesOfType(doc, 'environment')).toHaveLength(1); // center
		expect(nodesOfType(doc, 'inline_latex')).toHaveLength(0); // no chips left
		expect(nodesOfType(doc, 'hard_break')).toHaveLength(0); // breaks baked into the raw
		const raw = nodesOfType(doc, 'raw_latex');
		expect(raw).toHaveLength(1);
		expect(raw[0].textContent).toContain('\\guidetitle');
		expect(raw[0].textContent).toContain('\\guidecourse');
		expect(raw[0].textContent).toContain('\\guidedate');
		expect(raw[0].textContent).toContain('\\vspace{\\baselineskip}'); // line breaks preserved
	});

	it('reaches a fixed point through serialize→parse (no compounding)', () => {
		for (const src of ['\\foo \\bar text', CENTER, CENTER_BREAKS]) {
			const r1 = rt(src);
			const r2 = rt(r1);
			const r3 = rt(r2);
			expect(r2).toBe(r3); // settled by the second pass; no growth
		}
	});
});
