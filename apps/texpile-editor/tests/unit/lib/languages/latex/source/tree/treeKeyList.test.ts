import { describe, expect, it } from 'vitest';
import { parser } from '$lib/languages/latex/source/tree/parser';
import { keyListFromTree } from '$lib/languages/latex/source/tree/treeKeyList';

const listAtBar = (marked: string) => {
	const pos = marked.indexOf('|');
	const text = marked.slice(0, pos) + marked.slice(pos + 1);
	return keyListFromTree(parser.parse(text), text, pos);
};

describe('keyListFromTree', () => {
	it('finds the command past a brace group written in the list', () => {
		expect(listAtBar('\\draw[fill={red}, line w|')).toMatchObject({ command: 'draw', opener: '[', typed: [] });
	});

	it('reads a list over several lines and the options of an environment', () => {
		expect(listAtBar('\\hypersetup{\n  colorlinks,\n  link|')).toMatchObject({ command: 'hypersetup', opener: '{' });
		expect(listAtBar('\\begin{minted}[breaklines, f|]{cpp}\nx\n\\end{minted}')).toMatchObject({ command: 'begin', environment: 'minted' });
	});

	it('finds none in a comment or after a bracket that closed', () => {
		expect(listAtBar('% \\draw[fi|')).toBeNull();
		expect(listAtBar('\\cite[p.~3]{k} and |')).toBeNull();
	});
});
