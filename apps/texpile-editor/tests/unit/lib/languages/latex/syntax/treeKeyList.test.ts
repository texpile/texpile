import { describe, expect, it } from 'vitest';
import { parser } from '$lib/languages/latex/syntax/parser';
import { keyListFromTree } from '$lib/languages/latex/syntax/treeKeyList';

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

	it('reads the options of a verbatim environment over several lines, and nothing in its body', () => {
		expect(listAtBar('\\begin{minted}[breaklines,\n  fra|]{cpp}\nx\n\\end{minted}')).toMatchObject({ environment: 'minted' });
		expect(listAtBar('\\begin{lstlisting}[caption=x]\nint a[|i];\n\\end{lstlisting}')).toBeNull();
	});
});
