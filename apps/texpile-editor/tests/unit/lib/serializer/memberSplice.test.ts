import { describe, it, expect } from 'vitest';
import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

function posOf(doc: Node, needle: string): number {
	let found = -1;
	doc.descendants((n, pos) => {
		if (found < 0 && n.isText && n.text!.includes(needle)) found = pos + n.text!.indexOf(needle);
		return found < 0;
	});
	return found;
}

const wrap = (float: string) => `\\documentclass{article}\n\\begin{document}\n${float}\n\\end{document}\n`;

describe('a table cell edited inside its float', () => {
	it('changes only that cell when the caption sits below the tabular', () => {
		const file = wrap(`\\begin{table}[t]
  \\centering
  \\vspace{-1mm}
  \\begin{tabular}{lr}
    Method & Score \\\\ \\hline
    Ours & 90.1 \\\\
  \\end{tabular}
  \\caption{Results.}\\label{tab:res}
\\end{table}`);
		const parsed = parseLatexFile(file);
		const at = posOf(parsed.doc, '90.1');
		const doc = new Transform(parsed.doc).addMark(at, at + 4, parsed.doc.type.schema.marks.strong.create()).doc;
		expect(serializeLatexFile(parsed, doc)).toBe(file.replace('90.1', '\\textbf{90.1}'));
	});

	it('changes only that cell in a float with no caption', () => {
		const file = wrap(`\\begin{table}[h]
\\begin{tabular}{ll}
alpha & beta \\\\
\\end{tabular}
\\end{table}`);
		const parsed = parseLatexFile(file);
		const at = posOf(parsed.doc, 'alpha');
		const doc = new Transform(parsed.doc).delete(at, at + 'alpha'.length).doc;
		expect(serializeLatexFile(parsed, doc)).toBe(file.replace('alpha', ''));
	});
});

describe('a word typed in a labelled item', () => {
	it('changes only that word, the other items and their comments kept', () => {
		const file = wrap(`\\begin{description}
	\\item[Term] its definition. % check this
	\\item[Other] a second definition.
\\end{description}`);
		const parsed = parseLatexFile(file);
		const at = posOf(parsed.doc, 'second');
		const doc = new Transform(parsed.doc).insert(at, parsed.doc.type.schema.text('much ')).doc;
		expect(serializeLatexFile(parsed, doc)).toBe(file.replace('a second', 'a much second'));
	});
});
