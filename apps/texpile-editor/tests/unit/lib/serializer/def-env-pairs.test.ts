// \def\be{\begin{equation}} with \def\ee{\end{equation}}: the span between \be and \ee is math,
// and was text-escaped as prose (x\_i\^{}2)
import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

describe('environment shorthand defs', () => {
	it('keep the math between the pair verbatim, defined in the body', () => {
		const src = '\\def\\be{\\begin{equation}}\\def\\ee{\\end{equation}}\n\nText \\be x_i^2 \\ee more.';
		const out = serializeToLatex(treeToProseMirror(src).doc);
		expect(out).toContain('\\be x_i^2 \\ee');
		expect(out).not.toContain('\\_');
	});

	it('keep it when the pair is defined in the preamble', () => {
		const preamble = '\\documentclass{article}\n\\def\\be{\\begin{equation}}\n\\def\\ee{\\end{equation}}\n\\begin{document}';
		const out = serializeToLatex(treeToProseMirror('Text \\be x_i^2 \\ee more.', { preamble }).doc);
		expect(out).toContain('\\be x_i^2 \\ee');
	});
});
