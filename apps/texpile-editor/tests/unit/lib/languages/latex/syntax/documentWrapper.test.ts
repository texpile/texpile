import { describe, expect, it, vi } from 'vitest';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { documentBeginOf, documentEndOf, documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { preambleOf } from '$lib/languages/latex/intellisense/packages/loadedPackages';

vi.mock('$lib/languages/latex/syntax/latexTrees', async (original) => {
	const real = await original<typeof import('$lib/languages/latex/syntax/latexTrees')>();
	return { ...real, latexTreeOf: vi.fn(real.latexTreeOf) };
});

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

	it('finds \\begin{document} in the text up to it, as the whole tree does', () => {
		const body = 'Text of the body.\n'.repeat(500);
		const texts = [
			`\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n${body}\\end{document}\n`,
			`\\documentclass{article}\n% \\begin{document} later\n\\begin{document}\n${body}\\end{document}\n`,
			`\\documentclass{article}\n\\begin{verbatim}\n\\begin{document}\n\\end{verbatim}\n\\begin{document}\n${body}\\end{document}\n`,
			`\\documentclass{article}\n\\newcommand{\\open}{\\begin{document}}\n\\begin{document}\n${body}\\end{document}\n`,
			`\\documentclass{article}\n\\endinput\n\\begin{document}\n${body}\\end{document}\n`,
			`\\documentclass{article}\n\\begin{document}\n${body}`,
			`\\newcommand{\\open}{\\begin{document}}\n${body}`,
			`\\section{Only a fragment}\n${body}`
		];
		for (const text of texts) expect(documentBeginOf(text)).toBe(documentWrapperOf(text)?.begin.from ?? null);
		const text = texts[2];
		vi.mocked(latexTreeOf).mockClear();
		expect(documentBeginOf(text)).toBe(text.lastIndexOf('\\begin{document}'));
		expect(Math.max(...vi.mocked(latexTreeOf).mock.calls.map(([read]) => read.length))).toBeLessThan(text.length / 4);
	});
});
