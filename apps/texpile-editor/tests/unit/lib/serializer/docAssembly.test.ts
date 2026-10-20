import { describe, it, expect } from 'vitest';
import * as LatexParser from '$lib/languages/latex/parser/latexParser';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(LatexParser.latexToProseMirror(s).doc);

describe('a paragraph ending in a comment line', () => {
	it('keeps the next environment on a line of its own, however long the comment', () => {
		const comment = '%' + ' a comment that runs on'.repeat(6);
		for (const next of ['\\begin{comment}\ny\n\\end{comment}', '\\begin{itemize}\n\\item y\n\\end{itemize}'])
			expect(rt(`Text.\n${comment}\n${next}\n`)).toContain(`${comment}\n${next.split('\n')[0]}`);
	});
});
