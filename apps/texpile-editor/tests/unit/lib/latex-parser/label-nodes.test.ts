// A \label that no float, table or equation claimed used to reach the editor as raw source sitting
// in the prose. It is a node now, which is also what lets a reference to a section resolve.
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

function parse(src: string) {
	return treeToProseMirror(src, {}).doc;
}

function rt(src: string): string {
	return serializeToLatex(parse(src)).trim();
}

function names(src: string): string[] {
	return [...JSON.stringify(parse(src)).matchAll(/"name":"([^"]*)"/g)].map((m) => m[1] as string);
}

describe('a standalone label', () => {
	it('becomes a node wherever it stands', () => {
		expect(names('\\section{Methods}\n\\label{sec:methods}\n\nText.')).toEqual(['sec:methods']);
		expect(names('Some prose \\label{mid:para} more.')).toEqual(['mid:para']);
		expect(names('\\begin{itemize}\n\\item one \\label{itm:a}\n\\end{itemize}')).toEqual(['itm:a']);
	});

	it('goes back exactly where it stood, since its position is what it names', () => {
		expect(rt('\\section{Methods}\n\\label{sec:methods}\n\nText.')).toBe('\\section{Methods}\n\\label{sec:methods}\n\nText. \\par');
		expect(rt('Some prose \\label{mid:para} more.')).toBe('Some prose \\label{mid:para} more. \\par');
	});

	it('does not gain a \\par it never had, which would land after every section label', () => {
		expect(rt('\\section{M}\n\\label{sec:m}\n\nT.')).not.toContain('\\label{sec:m} \\par');
	});

	it('keeps its source when the name has structure an attr would flatten', () => {
		expect(names('\\label{\\thesection:x}')).toEqual([]);
		expect(rt('\\label{\\thesection:x}')).toBe('\\label{\\thesection:x}');
	});
});

describe('labels a float already owns', () => {
	// these were never raw, and must not start being label nodes: the float carries its own
	it('stay with the float', () => {
		expect(names('\\begin{figure}\n\\includegraphics{a.png}\n\\caption{C}\n\\label{fig:a}\n\\end{figure}')).toEqual([]);
		expect(names('\\begin{equation}\\label{eq:a}\nE=mc^2\n\\end{equation}')).toEqual([]);
	});
});
