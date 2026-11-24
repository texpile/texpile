import { describe, expect, it } from 'vitest';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { enumerateLabels } from '$lib/languages/latex/visual/plugins/list/enumerateLabels';

function labelsOf(body: string): string[] {
	const { doc } = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`);
	return [...enumerateLabels(doc).values()];
}

describe('enumerate labels', () => {
	it('counts each list from one, inside a theorem too', () => {
		const list = '\\begin{enumerate}\n\\item a\n\\item b\n\\end{enumerate}';
		expect(labelsOf(`${list}\n\\begin{theorem}\nT\n${list}\n\\end{theorem}\n${list}`)).toEqual(['1.', '2.', '1.', '2.', '1.', '2.']);
	});

	it('prints a nested list as enumii, an \\item[label] its own label, and enumitem labels and starts', () => {
		expect(
			labelsOf(
				'\\begin{enumerate}\n\\item a\n\\begin{enumerate}\n\\item x\n\\item[(*)] y\n\\item z\n\\end{enumerate}\n\\end{enumerate}\n\\begin{enumerate}[label=(\\roman*), start=3]\n\\item c\n\\end{enumerate}'
			)
		).toEqual(['1.', '(a)', '', '(b)', '(iii)']);
	});
});

describe('bullet labels by depth (A14)', () => {
	const nest = (open: string) =>
		`\\begin{itemize}${open}\n\\item a\n\\begin{itemize}\n\\item b\n\\begin{itemize}\n\\item c\n\\begin{itemize}\n\\item d\n\\end{itemize}\n\\end{itemize}\n\\end{itemize}\n\\end{itemize}`;
	const bulletsOf = (body: string) => {
		const { doc } = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`);
		return [...enumerateLabels(doc).values()];
	};

	it('prints the kernel marks of depths one to four', () => {
		expect(bulletsOf(nest(''))).toEqual(['•', '–', '∗', '·']);
	});

	it('prints a plain-text enumitem label', () => {
		expect(bulletsOf('\\begin{itemize}[label=--]\n\\item a\n\\end{itemize}')).toEqual(['–']);
	});
});
