import { describe, expect, it } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

describe('tableBlocks', () => {
	it('ends a row at \\tabularnewline and writes the row back with it', () => {
		const { doc } = treeToProseMirror(
			'\\begin{tabular}{ll}\n\\toprule\na & b\\tabularnewline\\addlinespace\nc & d\\tabularnewline\n\\end{tabular}\n'
		);
		const table = doc.child(0);
		expect(table.childCount).toBe(2);
		expect(table.child(1).textContent).toBe('cd');
		expect(serializeToLatex(doc)).toContain('a & b \\tabularnewline\n\\addlinespace\nc & d \\tabularnewline');
	});

	it('keeps a \\multicolumn over one column, which realigns its cell', () => {
		const { doc } = treeToProseMirror('\\begin{tabular}{ll}\n\\multicolumn{1}{c}{SB} & b \\\\\n\\end{tabular}\n');
		expect(serializeToLatex(doc)).toContain('\\multicolumn{1}{c}{SB} & b \\\\');
	});

	it('reads the switches a cell opens with as the cell, its words as text', () => {
		const { doc } = treeToProseMirror('\\begin{tabular}{p{3cm}l}\n\\centering \\scriptsize Mean & b \\\\\n\\end{tabular}\n');
		const cell = doc.child(0).child(0).child(0);
		expect([cell.attrs.lead, cell.textContent, cell.firstChild!.firstChild!.type.name]).toEqual([
			'\\centering \\scriptsize ',
			'Mean',
			'text'
		]);
		expect(serializeToLatex(doc)).toContain('\\centering \\scriptsize Mean & b \\\\');
	});
});
