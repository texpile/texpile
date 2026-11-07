import { describe, expect, it } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

describe('boxedTabularOf', () => {
	it('reads a table float whose tabular sits in boxes, and writes the boxes back around it', () => {
		const src = [
			'\\begin{table}',
			'\\begin{centering}',
			'\\resizebox{\\linewidth}{!}{',
			'\\begin{tabular}{ll}',
			'a & b\\tabularnewline',
			'\\end{tabular}}',
			'\\par\\end{centering}',
			'\\caption{Rates}',
			'\\end{table}',
			''
		].join('\n');
		const { doc } = treeToProseMirror(src);
		expect(doc.child(0).type.name).toBe('table_wrapper');
		const out = serializeToLatex(doc);
		expect(out).toContain('\\begin{centering}\n\\resizebox{\\linewidth}{!}{\n\\begin{tabular}{ll}\n');
		expect(out).toContain('\\end{tabular}}\n\\par\\end{centering}\n\\caption{Rates}');
	});
});
