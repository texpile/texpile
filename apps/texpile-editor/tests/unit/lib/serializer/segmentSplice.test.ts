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

describe('a word edited before a bold run or a formula', () => {
	const FILE = `\\documentclass{article}
\\begin{document}
We show the claim here. % TODO check the constant
It follows from \\textbf{the lemma} and $x > 0$ at once.
\\end{document}
`;

	it('keeps the comment and the line break between them', () => {
		const parsed = parseLatexFile(FILE);
		const at = posOf(parsed.doc, 'show');
		const doc = new Transform(parsed.doc).replaceWith(at, at + 'show'.length, parsed.doc.type.schema.text('prove')).doc;
		expect(serializeLatexFile(parsed, doc)).toBe(FILE.replace('We show', 'We prove'));
	});
});
