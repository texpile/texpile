// inline constructs the regeneration rewrote into something else
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('inline fidelity', () => {
	it('\\newline stays \\newline and \\\\ keeps its star or argument (43, 44)', () => {
		expect(rt('a\\newline b')).toContain('\\newline');
		expect(rt('a \\\\* b')).toContain('\\\\*');
		expect(rt('a \\\\[2ex] b')).toContain('\\\\[2ex]');
	});

	it('\\textcolor keeps its colour model (46)', () => {
		expect(rt('\\textcolor[rgb]{0.5,0,0}{red text}')).toContain('\\textcolor[rgb]{0.5,0,0}{red text}');
	});

	it('\\hl keeps the scope of its color', () => {
		expect(rt('a \\hl{b} c')).toContain('a \\hl{b} c');
		expect(rt('a {\\sethlcolor{green}\\hl{b}} c')).toContain('a {\\sethlcolor{green}\\hl{b}} c');
		expect(rt('a {\\sethlcolor{green} \\hl{b} d} c')).toContain('a {\\sethlcolor{green} \\hl{b} d} c');
		const marks = (s: string) =>
			LatexParser.latexToProseMirror(s).doc.firstChild!.firstChild!.marks.map((m) => [m.type.name, m.attrs.color]);
		expect(marks('\\hl{b}')).toEqual([['highlight', null]]);
		expect(marks('{\\sethlcolor{green}\\hl{b}}')).toEqual([['highlight', 'green']]);
	});

	it('\\colorbox stays \\colorbox, model and all, not soul\'s \\hl', () => {
		expect(rt('a \\colorbox{yellow}{b} c')).toContain('a \\colorbox{yellow}{b} c');
		expect(rt('a \\colorbox[rgb]{1,0.9,0}{b} c')).toContain('a \\colorbox[rgb]{1,0.9,0}{b} c');
	});

	it('a blank line inside an argument or a cell does not fuse the words (47)', () => {
		expect(rt('\\textbf{first\n\nsecond}')).toMatch(/first second/);
		expect(rt('\\begin{tabular}{l}\nfirst\n\nsecond \\\\\n\\end{tabular}')).toMatch(/first second/);
	});

	it('\\href text is converted, not re-escaped (48)', () => {
		const once = rt('\\href{https://x.com}{c\\_d}');
		expect(once).toContain('\\href{https://x.com}{c\\_d}');
		expect(rt(once)).toContain('\\href{https://x.com}{c\\_d}');
	});

	it('\\LaTeX and \\TeX stay logos, skips survive, \\verb* keeps its star (51)', () => {
		expect(rt('Made with \\LaTeX{} and \\TeX.')).toContain('\\LaTeX{}');
		expect(rt('Made with \\LaTeX{} and \\TeX.')).toContain('\\TeX');
		expect(rt('a\n\n\\bigskip\n\nb')).toContain('\\bigskip');
		expect(rt('\\verb*|a b|')).toContain('\\verb*|a b|');
	});

	it('an empty accent group keeps the accent off the next letter (52)', () => {
		expect(rt('x\\^{}y')).toContain('\\^{}y');
		expect(rt("x\\'{}y")).toContain("\\'{}y");
	});

	it('a citation with only a postnote uses one bracket (53)', () => {
		expect(rt('\\cite[p.~3]{k}')).toContain('\\cite[p.~3]{k}');
		expect(rt('\\citep[see][p.~3]{k}')).toContain('\\citep[see][p.~3]{k}');
	});

	it('quotation, equation* and \\( \\) come back as written (54)', () => {
		expect(rt('\\begin{quotation}\nq\n\\end{quotation}')).toContain('\\begin{quotation}');
		expect(rt('\\begin{equation*}\nx\n\\end{equation*}')).toContain('\\begin{equation*}');
		expect(rt('A \\(x\\) B $y$')).toContain('\\(x\\)');
		expect(rt('A \\(x\\) B $y$')).toContain('$y$');
	});

	it('\\centering survives outside a float (41)', () => {
		expect(rt('\\begin{minipage}{0.5\\textwidth}\n\\centering\ntext\n\\end{minipage}')).toContain('\\centering');
	});

	it('\\section[Short]{Long} keeps the short title (40)', () => {
		expect(rt('\\section[Short]{Long title}\n\ntext')).toContain('\\section[Short]{Long title}');
	});

	it('a three-argument macro mid-sentence does not split the paragraph (50)', () => {
		const out = rt('Text \\iftoggle{a}{b}{c} more.');
		expect(out.split('\\par').length - 1).toBe(1);
		expect(out).toContain('\\iftoggle{a}{b}{c}');
	});
});
