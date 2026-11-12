import { describe, expect, it } from 'vitest';
import { latexParserFor, latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { NO_OWN_SYNTAX } from '$lib/languages/latex/syntax/tokens/ownSyntax';
import { ownLiteralsIn } from '$lib/languages/latex/userDefinitions';
import { applyEdit, firstDifference, sharedTrees, type TextEdit } from './incrementalParse';
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

// a file is read on from the tree of the nearest kept one: the reading must be the one a parse from nothing gives
describe('a file read again after an edit', () => {
	const section = (n: number) =>
		`\\section{Part ${n}}\\label{sec:${n}}\nSome text with $x_${n}^2$ and \\cite{key${n}}. % a note\n\n` +
		`\\begin{figure}\n\\includegraphics{f${n}.pdf}\n\\caption{The ${n}th figure.}\n\\end{figure}\n\n` +
		`\\begin{code}\nd = { 'a': ${n} } \\notacommand\n\\end{code}\nMore words follow here, enough to fill a line.\n\n`;
	const body = Array.from({ length: 40 }, (_, n) => section(n)).join('');
	const at = (needle: string, text: string) => text.indexOf(needle) + needle.length;
	const edits: ((text: string) => TextEdit)[] = [
		(t) => ({ from: at('Part 20}', t), to: at('Part 20}', t), insert: 'x' }),
		(t) => ({ from: at('% a note', t), to: at('% a note', t), insert: ' more' }),
		(t) => ({ from: at("'a': 7 }", t), to: at("'a': 7 }", t), insert: ' \\x' }),
		(t) => ({ from: at('\\section{Part 30}', t) - 1, to: at('\\section{Part 30}', t), insert: '' }),
		(t) => ({ from: at('\\caption{The 12th', t), to: at('\\caption{The 12th', t), insert: ' $' })
	];
	for (const [name, preamble] of [
		['plain', '\\documentclass{article}\n\\begin{document}\n'],
		['with a verbatim environment of its own', '\\documentclass{article}\n\\lstnewenvironment{code}{}{}\n\\begin{document}\n']
	]) {
		it(`reads what a parse from nothing reads: ${name}`, () => {
			let text = `${preamble}${body}\\end{document}\n`;
			let before = latexTreeOf(text);
			for (const edit of edits) {
				text = applyEdit(text, edit(text));
				const after = latexTreeOf(text);
				const own = { math: NO_OWN_SYNTAX.math, literals: ownLiteralsIn(text) };
				expect(firstDifference(after, latexParserFor(false, own).parse(text))).toBeNull();
				expect(sharedTrees(before, after)).toBeGreaterThan(0);
				before = after;
			}
		});
	}
});

// twelve readings were kept whatever they were: every change to one file left another reading of it, and those pushed
// out the other files of the project, each then read from nothing after the next change
describe('the files kept', () => {
	const file = (name: string) => `\\section{${name}}\n${`Words of the file ${name}. `.repeat(200)}`;

	it('keeps a file that is still asked for while another one changes', () => {
		const other = file('other');
		const tree = latexTreeOf(other);
		let typed = file('typed');
		for (let n = 0; n < 30; n++) {
			typed += ' x';
			latexTreeOf(typed);
		}
		expect(latexTreeOf(other)).toBe(tree);
	});

	it('keeps a tree of each file of a project of many short files', () => {
		const texts = Array.from({ length: 30 }, (_, n) => file(`chapter ${n}`));
		const trees = texts.map((text) => latexTreeOf(text));
		expect(texts.map((text) => latexTreeOf(text))).toEqual(trees);
		expect(latexTreeOf(texts[0])).toBe(trees[0]);
	});
});

describe('the import of a document verbatim environment', () => {
	it('keeps the braces of its body', () => {
		const text = `\\documentclass{article}\n\\usepackage{listings}\n\\lstnewenvironment{code}{}{}\n\\begin{document}\n\\begin{code}\n${BODY}\n\\end{code}\n\\end{document}\n`;
		expect(JSON.stringify(parseLatexFile(text).doc.toJSON())).toContain("{ 'a': 1 }");
	});
});
