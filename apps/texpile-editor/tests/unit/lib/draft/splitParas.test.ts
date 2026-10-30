import { describe, expect, it } from 'vitest';
import { splitParas } from '$lib/draft/heuristics/splitParas';

describe('splitParas boundaries', () => {
	it('a part line and a class heading end the paragraph above them', () => {
		const paras = splitParas('text a\n\\part{P}\ntext b\n\\specialsection{S}\ntext c');
		expect(paras.map((p) => p.text)).toEqual(['text a', 'text b', 'text c']);
	});
});

describe('a float in a list', () => {
	it('gives its body no paragraph', () => {
		const paras = splitParas(
			'\\begin{itemize}\n\\item Words.\n\\begin{figure}\n\\centering\n\\includegraphics{a}\n\\caption{Cap}\n\\end{figure}\n\\item More.\n\\end{itemize}'
		);
		expect(paras.map((p) => p.text)).toEqual(['Words.', 'More.']);
	});
});

describe('splitParas reads the syntax tree', () => {
	it('a commented \\end does not close the block', () => {
		const paras = splitParas('\\begin{quote}\nwords\n% \\end{quote}\nmore\n\\end{quote}\n\nAfter.');
		expect(paras[0]).toMatchObject({ env: 'quote', text: '\\begin{quote}\nwords\n% \\end{quote}\nmore\n\\end{quote}' });
		expect(paras[1].text).toBe('After.');
	});

	it('reads no heading inside \\iffalse or a macro body', () => {
		const paras = splitParas('\\iffalse\n\\section{Old}\n\\fi\n\n\\newcommand{\\x}{\n\\section{New}\n}\n\nText.');
		expect(paras.some((p) => p.head)).toBe(false);
	});

	it('marks a block the tree leaves unclosed', () => {
		const paras = splitParas('\\begin{document}\n\\begin{equation}\nx\n\nTail.\n\\end{document}');
		expect(paras[0]).toMatchObject({ env: 'equation', open: true, text: '\\begin{equation}\nx\n\nTail.' });
	});

	it('ends a block at its own \\end when a brace left open swallows it', () => {
		const paras = splitParas('\\begin{abstract}\nWe { study.\n\\end{abstract}\n\nTail.');
		expect(paras[0]).toMatchObject({ env: 'abstract', text: '\\begin{abstract}\nWe { study.\n\\end{abstract}' });
		expect(paras[0].open).toBeUndefined();
		expect(paras[1].text).toBe('Tail.');
	});

	it('splits the items of a list inside a brace group', () => {
		const paras = splitParas('Alpha.\n\n{\\small\n\\begin{itemize}\n\\item one\n\\item two\n\\end{itemize}}\n\nBeta.');
		expect(paras.filter((p) => p.wrap === 'itemize').map((p) => p.text)).toEqual(['one', 'two']);
	});

	it('keeps a list inside a command argument in its paragraph', () => {
		const paras = splitParas('\\footnote{\n\\begin{itemize}\n\\item one\n\\end{itemize}}');
		expect(paras.some((p) => p.wrap)).toBe(false);
	});
});
