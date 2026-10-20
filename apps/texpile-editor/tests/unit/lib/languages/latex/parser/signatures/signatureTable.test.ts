import { describe, expect, it } from 'vitest';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { findMacros } from '$lib/languages/latex/parser/ast-utils';
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

function regenerated(body: string): string {
	const parsed = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`);
	return serializeLatexFile(parsed, withoutOrigins(parsed.doc));
}

async function tableOf(...names: string[]) {
	return packageTableOf(
		await loadedPackages(
			names.map((name) => ({ name, options: [] })),
			true
		)
	);
}

const LIST = '\\begin{itemize}\n\\item <5 ms, but >3 ms\n\\end{itemize}';

describe('the signatures a parse reads', () => {
	it("keeps beamer's overlay arguments to beamer documents", async () => {
		const article = latexToProseMirror(LIST, { table: await tableOf('class-article') });
		expect(article.doc.textContent).toContain('5 ms, but');
		const slides = latexToProseMirror(LIST, { table: await tableOf('class-beamer') });
		expect(findMacros(slides.ast, 'item')[0].args?.some((a) => a.openMark === '<')).toBe(true);
	});

	it('reads the optional argument a class adds to a kernel command', async () => {
		const { ast } = latexToProseMirror('\\author[0000-0002-8077-094X]{Yuhao Chen}', { table: await tableOf('class-aastex701') });
		expect(findMacros(ast, 'author')[0].args?.map((a) => a.openMark)).toEqual(['[', '{']);
	});

	it("gives a kernel math command its argument in math only, and the kernel's other commands past a comment", () => {
		expect(regenerated('\\begin{numcases}{\\dot m_{dep} =}\nx\n\\end{numcases}')).toContain('{\\dot m_{dep} =}');
		expect(regenerated('$L_\\mathrm{max}$ text')).not.toContain('\\mathrm}');
		expect(regenerated('\\markboth{Left}%\n{Right}\n\nText.')).toMatch(/\\markboth\{Left\}%?\s*\{Right\}/);
	});

	it("lets the document's own definition of a kernel command win", () => {
		const { ast } = latexToProseMirror('\\renewcommand{\\markright}[2]{#1 #2}\n\\markright{a}{b}');
		expect(
			findMacros(ast, 'markright')
				.at(-1)
				?.args?.filter((a) => a.openMark === '{')
		).toHaveLength(2);
	});

	it("gives the parser a package's signature where unified-latex has another", async () => {
		const { ast } = latexToProseMirror('\\hyperdef[x]{a}{b}{c}', { table: await tableOf('class-article', 'hyperref') });
		expect(findMacros(ast, 'hyperdef')[0].args?.map((a) => a.openMark)).toEqual(['[', '{', '{', '{']);
	});
	it("keeps a command's optional arguments under a package that wraps it (bibunits over natbib's \\cite)", async () => {
		const table = await tableOf('class-article', 'natbib', 'bibunits');
		expect(table.macros.cite.map((a) => a.kind)).toEqual(['s', 'o', 'o', 'm']);
	});

	it('reads a parameterless \\newcommand as taking none and a \\renewcommand as handing on its arguments', () => {
		const out = regenerated(
			'\\newcommand{\\so}{0}\n\\providecommand{\\section}{}\n\\renewcommand\\section{\\@startsection{section}{1}{0pt}{1ex}{1ex}{\\bf}}\n\\section{Intro}\n\n\\begin{tabular}{ll}\na & \\so \\\\ b & \\so \\\\\n\\end{tabular}'
		);
		expect(out).toContain('\\section{Intro}');
		expect(out).toMatch(/a & \\so \\\\\s*b & \\so \\\\/);
	});

	it('gives the command a definer names no arguments of its own', () => {
		expect(regenerated('\\providecommand*\\natexlab[1]{#1}\n\\def\\vec{\\mathaccent"717E }\n\nText.')).toMatch(
			/\\providecommand\*\\natexlab\[1\]\{#1\}\s*\\def\\vec\{/
		);
	});

	it('treats \\RenewDocumentCommand and \\DeclareRobustCommand like \\renewcommand and leaves an argument kind it cannot read to the usage guess', () => {
		expect(
			regenerated('\\RenewDocumentCommand{\\section}{}{\\@startsection{section}{1}{0pt}{1ex}{1ex}{\\bf}}\n\\section{Intro}\n\nText.')
		).toContain('\\section{Intro}');
		expect(regenerated('\\DeclareRobustCommand{\\cite}{\\@ifnextchar[\\@citex\\@cite}\n\nSee \\cite{a}.')).toContain('\\cite{a}');
		expect(() => regenerated('\\NewDocumentCommand{\\both}{G{x}m}{#1#2}\n\nSee \\both{a}{b}.')).not.toThrow();
	});
});
