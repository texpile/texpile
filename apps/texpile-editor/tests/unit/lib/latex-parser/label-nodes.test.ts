// A \label that no float, table or equation claimed used to reach the editor as raw source sitting
// in the prose. It is a node now, which is also what lets a reference to a section resolve.
import { describe, it, expect } from 'vitest';
import { latexToProseMirror } from '../../../../src/lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { sectionNumbers } from '$lib/languages/latex/visual/extensions/label/sectionNumbers';

function parse(src: string) {
	return latexToProseMirror(src, {}).doc;
}

function doc(src: string) {
	return schema.nodeFromJSON(JSON.parse(JSON.stringify(parse(src))));
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

describe('the number a label anchors', () => {
	it('counts sections and subsections the way the document will', () => {
		const n = sectionNumbers(
			doc('\\section{A}\n\\label{sec:a}\n\nx\n\n\\subsection{B}\n\\label{sec:b}\n\ny\n\n\\section{C}\n\\label{sec:c}\n\nz')
		);
		expect(n.get('sec:a')).toBe('1');
		expect(n.get('sec:b')).toBe('1.1');
		expect(n.get('sec:c')).toBe('2');
	});

	it('letters them after \\appendix, and restarts the count', () => {
		const n = sectionNumbers(doc('\\section{A}\n\\label{sec:a}\n\nx\n\n\\appendix\n\n\\section{Extra}\n\\label{app:a}\n\ny'));
		expect(n.get('app:a')).toBe('A');
	});

	it('is left unclaimed inside a list, where the counter is the item\u2019s', () => {
		const n = sectionNumbers(doc('\\section{A}\n\nx\n\n\\begin{itemize}\n\\item one \\label{itm:a}\n\\end{itemize}'));
		expect(n.has('itm:a')).toBe(false);
	});

	it('skips a starred heading, which advances nothing', () => {
		const n = sectionNumbers(doc('\\section{A}\n\\label{sec:a}\n\nx\n\n\\section*{U}\n\ny\n\n\\section{C}\n\\label{sec:c}\n\nz'));
		expect(n.get('sec:a')).toBe('1');
		expect(n.get('sec:c')).toBe('2');
	});
});
