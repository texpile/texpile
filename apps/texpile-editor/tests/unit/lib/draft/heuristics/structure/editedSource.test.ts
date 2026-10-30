import { afterEach, describe, expect, it, vi } from 'vitest';
import { Parser } from '@lezer/common';
import { latexParserFor } from '$lib/languages/latex/syntax/latexTrees';
import { decideEdit } from '$lib/draft/heuristics/dispatch';
import { readEdited, readSource } from '$lib/draft/heuristics/structure/editedSource';

const PARAGRAPH = 'Some prose with $x^2$ and \\emph{words} that fills the line.\n\n';
const DOC = `\\documentclass{article}\n\\begin{document}\n${PARAGRAPH.repeat(400)}\\begin{itemize}\n\\item one\n\\end{itemize}\n\\end{document}\n`;
const MIDDLE = DOC.indexOf(PARAGRAPH, DOC.length / 2);

afterEach(() => vi.restoreAllMocks());

describe('readEdited', () => {
	it.each([
		['a word typed', (s: string) => s.slice(0, MIDDLE + 5) + 'typed ' + s.slice(MIDDLE + 5)],
		['a brace left open', (s: string) => s.slice(0, MIDDLE + 5) + '{' + s.slice(MIDDLE + 5)],
		['an environment end removed', (s: string) => s.replace('\\end{itemize}', '')]
	])('reads %s as a full parse does', (_name, edit) => {
		const before = readSource(DOC);
		const src = edit(DOC);
		const tree = readEdited(before, src).tree;
		expect(tree.length).toBe(src.length);
		expect(tree.toString()).toBe(latexParserFor(false).parse(src).toString());
	});
});

describe('decideEdit', () => {
	it('parses only what a keystroke changed', () => {
		decideEdit(DOC, DOC + ' ');
		const parse = vi.spyOn(Parser.prototype, 'parse');
		const typed = DOC.slice(0, MIDDLE + 5) + 'x' + DOC.slice(MIDDLE + 5);
		decideEdit(DOC, typed);
		decideEdit(DOC, typed.slice(0, MIDDLE + 6) + 'y' + typed.slice(MIDDLE + 6));
		const whole = parse.mock.calls.filter(([input, fragments]) => String(input).length > 10_000 && !fragments?.length);
		expect(whole).toHaveLength(0);
	});
});
