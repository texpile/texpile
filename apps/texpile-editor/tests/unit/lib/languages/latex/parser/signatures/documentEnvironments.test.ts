import { describe, expect, it } from 'vitest';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';

function blockTypes(latex: string, preamble?: string): string[] {
	const out: string[] = [];
	latexToProseMirror(latex, { preamble }).doc.forEach((n) => out.push(n.type.name));
	return out;
}

describe('an environment the document defines', () => {
	it('stays editable prose over a package reading of its name', () => {
		const body = '\\begin{keywords}a \\emph{b}\\end{keywords}';
		expect(blockTypes(body)).toEqual(['raw_latex']);
		expect(blockTypes(body, '\\newenvironment{keywords}{\\par}{}')).toEqual(['environment']);
		expect(blockTypes('\\begin{todo} Fix $x$ \\cite{a} \\end{todo}', '\\newtheorem{todo}{Todo}')).toEqual(['environment']);
	});

	it('comes from a definition the file reads: not one in a comment, and every name \\declaretheorem lists', () => {
		const body = '\\begin{keywords}a \\emph{b}\\end{keywords}';
		expect(blockTypes(body, '% \\newenvironment{keywords}{\\par}{}')).toEqual(['raw_latex']);
		expect(blockTypes(body, '\\declaretheorem[style=plain]{keywords,lemma}')).toEqual(['environment']);
		const math = '\\begin{equation}x=1\\end{equation}';
		expect(blockTypes(math, '\\renewenvironment{equation}{\\begin{equation}}{\\end{equation}}')).toEqual(blockTypes(math));
	});
});
