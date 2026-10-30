// An environment with no registered signature had its arguments parsed as body text:
// `\begin{algorithmic}[1]` came back as `\begin{algorithmic}` with `[1]` in the first paragraph,
// `\begin{spacing}{1.5}` lost its factor into the body and stopped compiling.
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(treeToProseMirror(s).doc);

describe('unknown environments with arguments', () => {
	it.each([
		['algorithmic', '[1]'],
		['spacing', '{1.5}'],
		['tcolorbox', '[colback=red!5]'],
		['subfigure', '[b]{0.45\\textwidth}']
	])('\\begin{%s}%s keeps its arguments on the \\begin line', (env, args) => {
		const out = rt(`\\begin{${env}}${args}\nBody text.\n\\end{${env}}`);
		expect(out).toContain(`\\begin{${env}}${args}\n`);
		expect(out).not.toMatch(new RegExp(`\\n\\s*\\${args[0]}`.replace('\\[', '\\[')));
		expect(out).toContain('Body text.');
	});

	it('a group on its own line after \\begin stays body', () => {
		const out = rt('\\begin{myenv}\n{\\bfseries Title}\nBody.\n\\end{myenv}');
		expect(out).toContain('\\begin{myenv}\n');
		expect(out).toContain('Title');
	});
});
