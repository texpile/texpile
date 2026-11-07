// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

describe('a table in a chip', () => {
	it('draws a tabular inside a cell as its rows', () => {
		const face = latexFace('\\begin{tabular}[c]{@{}l@{}}ResNet38 Audio\\\\ Encoder\\end{tabular}', false);
		const rows = [...(face?.dom.querySelectorAll('.drawn-tabular-cell') ?? [])].map((cell) => cell.textContent);
		expect(rows).toEqual(['ResNet38 Audio', 'Encoder']);
		const spanned = latexFace(
			'{\\renewcommand{\\arraystretch}{1.1}\\begin{tabular}{lll}\\multicolumn{2}{c}{Audio} & B\\\\\n\\end{tabular}}',
			false
		);
		expect(spanned?.dom.querySelector<HTMLElement>('.drawn-tabular-cell')?.style.gridArea).toBe('1 / 1 / auto / span 2');
	});
});
