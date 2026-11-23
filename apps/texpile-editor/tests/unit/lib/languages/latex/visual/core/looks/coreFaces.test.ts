// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { FaceElement } from '$lib/editor/canvas';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

const drawn = (source: string) => latexFace(source, false) !== null;

it('draws text, styled runs, definitions and a formula body with canvas elements', () => {
	for (const source of [
		String.raw`\textbf{bold}`,
		String.raw`\textcolor{red}{x}`,
		String.raw`\newcommand{\a}{b}`,
		String.raw`\newcommand{\R}{\mathbb{R}}`,
		String.raw`\textbf{a $x$}`
	])
		expect(drawn(source), source).toBe(true);
});

it('a styled run wears the look of its command as declared', () => {
	const run = latexFace(String.raw`\textbf{bold}`, false)!.dom as FaceElement;
	expect(run.style.fontWeight).toBe('700');
});
