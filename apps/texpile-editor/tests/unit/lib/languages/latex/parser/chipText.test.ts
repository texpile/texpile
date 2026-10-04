import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { Transform } from 'prosemirror-transform';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { withoutOrigins } from '$lib/editor/visual/parseOrigins';

function chipsOf(source: string): string[] {
	const chips: string[] = [];
	parseLatexFile(source).doc.descendants((node) => {
		if (node.type.name === 'inline_latex') chips.push(node.textContent);
		return true;
	});
	return chips;
}

/** every block through the deterministic rules, the path an edited block takes */
function regenerated(doc: Node): string {
	return serializeToLatex(withoutOrigins(doc));
}

const SENTENCE = String.raw`Poincar\'e met Erd\H{o}s and Ha\v cek in \AA ngstr\"om units, see \S 3.`;
const PULLED = '\\vspace{-0.63em}\nA paragraph pulled up.';

describe('text that belongs to the chip before it', () => {
	it('gives an accent its letter and a symbol word the space TeX drops', () => {
		expect(chipsOf(String.raw`Poincar\'e, Schr\"odinger, Ha\v cek and \AA ngstr\"om, \S 3, na\"{\i}ve.`)).toEqual([
			String.raw`\'e`,
			String.raw`\"o`,
			String.raw`\v c`,
			String.raw`\AA `,
			String.raw`\"o`,
			String.raw`\S `,
			String.raw`\"{\i}`
		]);
	});

	it('gives a command drawn on its own line the space after it, so the next line has no stray space or blank', () => {
		const source = `\\documentclass{article}\n\\begin{document}\n\\smallskip\n\\medskip\n\\bigskip\n\n\\bibliographystyle{plain}\n\\end{document}\n`;
		expect(chipsOf(source)).toEqual(['\\smallskip ', '\\medskip ', '\\bigskip', '\\bibliographystyle{plain}']);
		const parsed = parseLatexFile(source);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(source);
	});

	it('leaves the line end after a command written against a word, so deleting the command keeps the words apart', () => {
		const source = `\\documentclass{article}\n\\begin{document}\nFirst word\\bigskip\nnext words.\n\\end{document}\n`;
		expect(chipsOf(source)).toEqual(['\\bigskip']);
		const parsed = parseLatexFile(source);
		let chip = -1;
		parsed.doc.descendants((node, pos) => {
			if (node.type.name === 'inline_latex') chip = pos;
			return chip < 0;
		});
		const doc = new Transform(parsed.doc).delete(chip, chip + parsed.doc.nodeAt(chip)!.nodeSize).doc;
		expect(serializeLatexFile(parsed, doc)).toContain('First word\nnext words.');
	});

	it('writes every byte back, verbatim and regenerated, and leaves a symbol ending its paragraph alone', () => {
		const source = `\\documentclass{article}\n\\begin{document}\n${SENTENCE}\n\nA symbol ends this paragraph: \\ss\n\n${PULLED}\n\n\\end{document}\n`;
		const parsed = parseLatexFile(source);
		expect(chipsOf(source)).toEqual(expect.arrayContaining([String.raw`\ss`, '\\vspace{-0.63em} ']));
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(source);
		expect(regenerated(parsed.doc)).toContain(SENTENCE);
		expect(regenerated(parsed.doc)).toContain('\\vspace{-0.63em} A paragraph pulled up.');
	});
});
