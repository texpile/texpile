// a reference finds its label in the model: the canvas draws no element carrying data-label
import { expect, it } from 'vitest';
import { labelPos } from '$lib/editor/visual/labelTaken';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const SOURCE = `\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
\\section{Intro}\\label{sec:intro}
Words.
\\begin{align}
a &= b \\label{eq:one}\\\\
c &= d \\label{eq:two}
\\end{align}
\\begin{table}
\\centering
\\caption{Results}\\label{tab:results}
\\begin{tabular}{ll}
a & b \\\\
\\end{tabular}
\\end{table}
\\end{document}
`;

it('finds a section label, an align line label and a float label, and nothing for a name no anchor has', async () => {
	const { doc } = await parseLatexFile(SOURCE);
	const typeAt = (name: string) => {
		const pos = labelPos(doc, name);
		return pos === null ? null : doc.nodeAt(pos)!.type.name;
	};
	expect(typeAt('eq:two')).toBe('block_math');
	expect(typeAt('tab:results')).toBe('table_wrapper');
	expect(typeAt('sec:intro')).not.toBeNull();
	expect(typeAt('sec:missing')).toBeNull();
});
