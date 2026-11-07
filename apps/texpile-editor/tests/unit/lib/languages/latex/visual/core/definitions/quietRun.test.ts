// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

const names = (dom: HTMLElement | undefined) => [...(dom?.querySelectorAll('.drawn-definition-name') ?? [])].map((el) => el.textContent);

describe('definitions and settings', () => {
	it('draws a run of definitions as one group of rows, a math body as math', () => {
		const face = latexFace(
			'\\global\\long\\def\\mA{\\mathcal{A}}%\n\\global\\long\\def\\vect#1{\\mathbf{#1}}\n\\newcommand{\\myTitle}{A Thesis}',
			true
		);
		expect(face?.line).toBe(true);
		expect(face?.dom.classList.contains('drawn-definitions')).toBe(true);
		expect(names(face?.dom)).toEqual(['\\mA', '\\vect#1', '\\myTitle']);
		expect(face?.dom.querySelectorAll('[role="math"]')).toHaveLength(2);
		expect(face?.dom.textContent).toContain('A Thesis');
	});

	it('draws what a command sets by the roles of its arguments', () => {
		expect(latexFace('\\thispagestyle{empty}', false)?.dom.textContent).toBe('Page style - empty');
		expect(latexFace('\\usepackage{amsmath}\n\\usepackage{amssymb}', true)?.dom.textContent).toBe('Package - amsmath, amssymb');
		// \arabic prints its counter
		expect(latexFace('\\arabic{page}', false)).toBeNull();
	});

	it('draws a command the data says prints nothing as a setting', () => {
		expect(latexFace('\\onecolumngrid', false)?.dom.textContent).toBe('onecolumngrid');
		expect(latexFace('\\addcontentsline{toc}{section}{Notes}', false)?.dom.textContent).toBe('addcontentsline - toc - section - Notes');
		expect(latexFace('\\newblock', false)?.dom.textContent).toBe(' ');
	});

	it('draws a math alphabet and its bold version as settings', () => {
		const source =
			'\\DeclareMathAlphabet{\\mathsfit}{\\encodingdefault}{\\sfdefault}{m}{sl}\n\\SetMathAlphabet{\\mathsfit}{bold}{\\encodingdefault}{\\sfdefault}{bx}{n}';
		expect(latexFace(source, true)?.dom.querySelectorAll('.drawn-setting')).toHaveLength(2);
	});
});
