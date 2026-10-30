import { describe, expect, it } from 'vitest';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { commandTokensOf } from '$lib/languages/latex/syntax/commandTokens';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const BODY = "d = { 'a': 1 } \\notacommand";

function nodeNamesIn(text: string): string[] {
	const names: string[] = [];
	latexTreeOf(text).iterate({ enter: (n) => void names.push(n.name) });
	return names;
}

describe('latexTreeOf', () => {
	it('reads expl3 names whole where expl3 syntax is on, and only there', () => {
		const names = (text: string) => commandTokensOf(text).list.map((t) => t.name);
		expect(names('\\ExplSyntaxOn \\tl_set:Nn \\ExplSyntaxOff \\a_b')).toEqual(['ExplSyntaxOn', 'tl_set:Nn', 'ExplSyntaxOff', 'a']);
		expect(names('{\\ExplSyntaxOn}\\a_b')).toEqual(['ExplSyntaxOn', 'a']);
		expect(names('\\ProvidesExplPackage{p}{}{}{} \\cs_new:Npn')).toEqual(['ProvidesExplPackage', 'cs_new:Npn']);
	});

	it('reads the body of an environment the document defines as verbatim as written', () => {
		for (const definition of [
			'\\lstnewenvironment{code}{}{}',
			'\\DefineVerbatimEnvironment{code}{Verbatim}{}',
			'\\newtcblisting{code}{listing only}',
			'\\excludecomment{code}'
		]) {
			const text = `${definition}\n\\begin{code}\n${BODY}\n\\end{code}\nafter`;
			expect(nodeNamesIn(text), definition).toContain('VerbatimEnvironment');
			expect(
				commandTokensOf(text).list.map((t) => t.name),
				definition
			).not.toContain('notacommand');
		}
	});

	it('reads the names \\newminted and \\newmint make', () => {
		const text = `\\newminted{python}{}\\newmint{python}{}\n\\begin{pythoncode}\n${BODY}\n\\end{pythoncode}\n\\python|${BODY}|`;
		expect(nodeNamesIn(text).filter((n) => n === 'VerbatimEnvironment' || n === 'Verb')).toEqual(['VerbatimEnvironment', 'Verb']);
		expect(commandTokensOf(text).list.map((t) => t.name)).not.toContain('notacommand');
	});

	it('reads an environment the document defines as TeX under a name others take as written', () => {
		const text = `\\newenvironment{comment}{}{}\n\\begin{comment}\n\\emph{x}\n\\end{comment}`;
		expect(nodeNamesIn(text)).not.toContain('VerbatimEnvironment');
		expect(commandTokensOf(text).list.map((t) => t.name)).toContain('emph');
	});
});

describe('the import of a document verbatim environment', () => {
	it('keeps the braces of its body', () => {
		const text = `\\documentclass{article}\n\\usepackage{listings}\n\\lstnewenvironment{code}{}{}\n\\begin{document}\n\\begin{code}\n${BODY}\n\\end{code}\n\\end{document}\n`;
		expect(JSON.stringify(parseLatexFile(text).doc.toJSON())).toContain("{ 'a': 1 }");
	});
});
