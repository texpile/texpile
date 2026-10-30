import { describe, expect, it } from 'vitest';
import { parser } from '$lib/languages/latex/syntax/parser';
import { modeFromTree } from '$lib/languages/latex/syntax/treeMode';

const modeAtBar = (marked: string) => {
	const pos = marked.indexOf('|');
	const text = marked.slice(0, pos) + marked.slice(pos + 1);
	return modeFromTree(parser.parse(text), text, pos);
};

describe('modeFromTree', () => {
	it('reads math from delimiters and environments, and text from an argument that states it', () => {
		expect(modeAtBar('Let $x^| 2$ be')).toBe('math');
		expect(modeAtBar('Let $x$ be| it')).toBe('text');
		expect(modeAtBar('$a \\text{if |} b$')).toBe('text');
		expect(modeAtBar('\\begin{align} a &= |b \\end{align}')).toBe('math');
		expect(modeAtBar('\\begin{equa|tion} a \\end{equation}')).toBe('text');
	});

	it('ends an open $ at a blank line, as TeX does', () => {
		expect(modeAtBar('an $open\n\npa|ra')).toBe('text');
	});

	it('gives no mode in a comment or a verbatim body', () => {
		expect(modeAtBar('% a $comment| x')).toBeNull();
		expect(modeAtBar('\\begin{verbatim}\n$ x| $\n\\end{verbatim}')).toBeNull();
	});

	it('reads a link address as one argument, so a % in it starts no comment', () => {
		expect(modeAtBar('\\href{http://a.org/a%20b}{text} and $x|$')).toBe('math');
	});
});
