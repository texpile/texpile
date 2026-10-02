// `%` inside \url{} or \href{}{} tokenized as a comment, so the rest of the line (the closing
// brace, the link text, whatever followed) vanished from the argument and the regenerated line
// was unbalanced LaTeX.
import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { maskUrlSpecials } from '$lib/languages/latex/parser/urlMask';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import type { Node as PMNode } from 'prosemirror-model';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);
const file = (body: string) => `\\documentclass{article}\n\\usepackage{hyperref}\n\\begin{document}\n${body}\n\\end{document}\n`;

function hrefOf(doc: PMNode): string | null {
	let href: string | null = null;
	doc.descendants((node) => {
		const link = node.marks.find((mark) => mark.type.name === 'link');
		if (link) href = String(link.attrs.href);
	});
	return href;
}

describe('% and # inside a URL argument', () => {
	it('survive regeneration in \\href and \\url', () => {
		const out = rt('Link: \\href{https://example.com/a%20b}{example} and \\url{http://a.com/%7Euser#frag}.');
		expect(out).toContain('\\href{https://example.com/a\\%20b}{example}');
		expect(out).toContain('\\url{http://a.com/%7Euser#frag}');
		expect(out).toContain('and');
	});

	// a heading's or \\textbf's argument is read before \\href is, where % is a comment and # a parameter;
	// hyperref reads \\% and \\# in a URL as the characters themselves
	it('are written escaped, and read back as the characters of the URL', () => {
		const source = file('See \\href{https://x.com/a\\%20b\\#c}{t} here.');
		const parsed = parseLatexFile(source);
		expect(hrefOf(parsed.doc)).toBe('https://x.com/a%20b#c');
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(source);
		expect(serializeToLatex(parsed.doc)).toContain('\\href{https://x.com/a\\%20b\\#c}{t}');
	});

	it('leave an unescaped URL a file wrote byte-identical when it is not edited', () => {
		const source = file('See \\href{https://x.com/#c}{t} and \\href{https://x.com/a%20b}{u} here.');
		const parsed = parseLatexFile(source);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(source);
	});

	it('the mask is length-preserving and leaves everything outside the URL alone', () => {
		const src = 'A \\% b \\url{x%y} % real comment\n\\href{p#q}{50\\% off}';
		const masked = maskUrlSpecials(src);
		expect(masked.length).toBe(src.length);
		expect(masked).toContain('% real comment');
		expect(masked).toContain('{50\\% off}');
		expect(masked).not.toContain('x%y');
		expect(masked).not.toContain('p#q');
	});
});
