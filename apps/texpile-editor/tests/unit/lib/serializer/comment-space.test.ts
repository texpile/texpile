// stripping a same-line comment deleted the node the tokenizer had folded the preceding space
// into, so `A % c` + newline + `B` regenerated as `AB`; TeX reads it as "A B"
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

const rt = (s: string) => serializeToLatex(treeToProseMirror(s).doc);

describe('a same-line comment keeps the space before it', () => {
	it('between words', () => {
		expect(rt('A % c\nB')).toMatch(/A B/);
	});

	it('after a citation', () => {
		expect(rt('\\cite{k} % ref\nnext')).toMatch(/\\cite\{k\} next/);
	});

	it('no space before the comment means no space', () => {
		expect(rt('A% c\nB')).toMatch(/AB/);
	});

	it('inside an argument', () => {
		expect(rt('\\textbf{A % c\nB}')).toMatch(/\\textbf\{A B\}/);
	});
});
