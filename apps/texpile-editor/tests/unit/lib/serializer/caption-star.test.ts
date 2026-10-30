// \caption* parsed as \caption{*} with the text adrift: a figure regenerated as
// \caption{*}{Unnumbered}, a table's caption text was demoted to notes.
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(treeToProseMirror(s).doc);

describe('\\caption*', () => {
	it('a figure keeps an unnumbered caption', () => {
		const out = rt('\\begin{figure}\n\\includegraphics{a.png}\n\\caption*{Unnumbered caption}\n\\end{figure}');
		expect(out).toContain('\\caption*{Unnumbered caption}');
		expect(out).not.toContain('{*}');
	});

	it('a table keeps an unnumbered caption as its caption', () => {
		const out = rt('\\begin{table}\n\\caption*{No number}\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\end{table}');
		expect(out).toContain('\\caption*{No number}');
		expect(out).not.toContain('{*}');
	});

	it('a plain \\caption is unchanged', () => {
		const out = rt('\\begin{figure}\n\\includegraphics{a.png}\n\\caption{Numbered}\n\\end{figure}');
		expect(out).toContain('\\caption{Numbered}');
	});
});
