import { describe, expect, it } from 'vitest';
import { documentEndOf, documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { preambleOf } from '$lib/languages/latex/intellisense/packages/loadedPackages';

describe('documentWrapper', () => {
	it('cuts the preamble at the real \\begin{document}, past a commented one', () => {
		const text =
			'\\documentclass{article}\n% \\begin{document} comes later\n\\usepackage{amsmath}\n\\begin{document}\nx\n\\end{document}\n';
		expect(preambleOf(text)).toContain('\\usepackage{amsmath}');
	});

	it('ends a fragment at its stray \\end{document}, past one in a macro body', () => {
		const text = '\\newcommand{\\finish}{\\end{document}}\nText.\n\\end{document}\nafter';
		expect(documentEndOf(text)).toBe(text.lastIndexOf('\\end{document}'));
	});

	it('finds the \\end{document} that a brace the file never closes runs past', () => {
		const text = '\\documentclass{article}\n\\begin{document}\n{\\textit {{Balance}}\nText.\n\\end{document}\n';
		expect(documentWrapperOf(text)?.end?.from).toBe(text.indexOf('\\end{document}'));
	});
});
