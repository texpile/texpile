import { describe, expect, it } from 'vitest';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { parseLatex } from '$lib/languages/latex/parser/parser';
import { latexToProseMirror } from '$lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

describe('consecutive comment lines reprint without a blank line between them', () => {
	it('in the parsed tree', () => {
		expect(printRaw(parseLatex('a\n% one\n% two\nb'))).toBe('a\n% one\n% two\nb');
		expect(printRaw(parseLatex('a % one\n% two\nb'))).toBe('a % one\n% two\nb');
	});

	it('in a raw chip regenerated from the tree', () => {
		const src = '{\\smaller \\begin{array}{l}\na \\\\\n%  one\n%  two\n\\end{array}}\n';
		expect(serializeToLatex(latexToProseMirror(src).doc)).toContain('%  one\n%  two\n');
	});
});
