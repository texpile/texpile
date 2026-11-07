// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { documentTable } from '$lib/languages/latex/visual/core/title/documentTable.svelte';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { BASE_PACKAGE_TABLE, packageTableOf } from '$lib/languages/latex/parser/signatures/packageTable';

afterEach(() => {
	documentTable.current = BASE_PACKAGE_TABLE;
});

describe('floats in chips', () => {
	it('draws a figure holding a TikZ picture as the figure card placeholder over its caption', () => {
		const face = latexFace(
			'\\begin{figure}\n\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\\caption{A simple body.}\n\\end{figure}',
			true
		);
		expect(face?.dom.className).toBe('drawn-float');
		expect(face?.dom.querySelector('.drawn-picture')?.textContent).toContain('TikZ figure');
		expect(face?.dom.querySelector('.drawn-caption')?.textContent).toContain('A simple body.');
	});

	it('gives the picture the figure card of the body, whose Edit button opens the picture', () => {
		const picture = '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}';
		const face = latexFace(`\\begin{figure}\n${picture}\n\\end{figure}`, true);
		const opened: unknown[] = [];
		window.addEventListener('texpileopenfigure', (e) => opened.push((e as CustomEvent).detail), { once: true });
		(face?.dom.querySelector('.figure-edit') as HTMLButtonElement).click();
		expect(opened).toEqual([{ index: -1, source: picture }]);
		face?.destroy?.();
	});

	it('draws subfloats as panels, each over its own caption, and a table cell without its commented row', () => {
		const face = latexFace(
			[
				'\\begin{table*}',
				'\\centering{}\\subfloat[First.\\label{a}]{\\centering{}%',
				'\\begin{tabular}{|l|c|}',
				'% Old & row\\tabularnewline',
				'TMPA & 98.10\\tabularnewline',
				'\\end{tabular}}~\\subfloat[Second.]{\\resizebox{\\linewidth}{!}{%',
				'\\begin{tabular}{l}x\\end{tabular}}}',
				'\\caption{Both.}',
				'\\end{table*}'
			].join('\n'),
			true
		);
		const panels = [...(face?.dom.querySelectorAll('.drawn-panel') ?? [])];
		expect(panels.map((panel) => panel.querySelector('.drawn-panel-caption')?.textContent?.trim())).toEqual(['First.a', 'Second.']);
		expect([...panels[0].querySelectorAll('.drawn-tabular-cell')].map((cell) => cell.textContent)).toEqual(['TMPA', '98.10']);
	});

	it('draws an xy-pic diagram as a placeholder and an image in a chip as the image', async () => {
		documentTable.current = packageTableOf(await parsedPackages('\\usepackage[all]{xy}'));
		expect(latexFace('$$\n\\xymatrix{X \\ar[r]^{f} & Y}\n$$', false)?.dom.textContent).toContain('xy-pic diagram');
		expect(latexFace('\\xymatrix{X \\ar[r] & Y}', false)?.dom.className).toBe('drawn-picture');
		const image = latexFace('\\includegraphics[scale=0.15]{figs/logo}', false)?.dom;
		expect([image?.tagName, image?.getAttribute('alt')]).toEqual(['IMG', 'figs/logo']);
	});
});
