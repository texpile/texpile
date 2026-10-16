import { describe, expect, it } from 'vitest';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { findMacros } from '$lib/languages/latex/parser/ast-utils';
import { installedPackageDefinitions } from '$lib/languages/latex/installedPackages';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

function regenerated(body: string): string {
	const parsed = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`);
	return serializeLatexFile(parsed, withoutOrigins(parsed.doc));
}

const LIST = '\\begin{itemize}\n\\item <5 ms, but >3 ms\n\\end{itemize}';

describe('the signatures a parse reads', () => {
	it("keeps beamer's overlay arguments to beamer documents", () => {
		const article = latexToProseMirror(LIST, { preamble: '\\documentclass{article}\n\\begin{document}' });
		expect(article.doc.textContent).toContain('5 ms, but');
		const slides = latexToProseMirror(LIST, { preamble: '\\documentclass{beamer}\n\\begin{document}' });
		expect(findMacros(slides.ast, 'item')[0].args?.some((a) => a.openMark === '<')).toBe(true);
	});

	it('reads the optional argument a class adds to a kernel command', () => {
		const { ast } = latexToProseMirror('\\author[0000-0002-8077-094X]{Yuhao Chen}', {
			preamble: '\\documentclass{aastex701}\n\\begin{document}'
		});
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
		const stubs = await installedPackageDefinitions([{ name: 'hyperref', options: '' }], '', async () => null);
		expect(stubs).toContain('\\NewDocumentCommand{\\hyperdef}{o m m m}{}');
	});
});
