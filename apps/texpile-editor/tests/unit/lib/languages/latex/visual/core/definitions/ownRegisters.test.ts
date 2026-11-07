// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { scanMacroDefinitions, scanRegisterDefinitions } from '$lib/editor/source/extensions/math-preview/userMacros';
import { templateFeaturesStore } from '$lib/stores/editorStore';

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined, registers: undefined };
});

it("draws the paper's own command that sets lengths, one of them a length the paper made, as settings", () => {
	const source = String.raw`\newlength{\tempjot}
\newcommand{\setjot}[1]{\setlength{\tempjot}{\getlength{\jot}pt}\setlength{\jot}{#1pt}}`;
	expect(scanRegisterDefinitions(source)).toEqual(['tempjot']);
	templateFeaturesStore.current = {
		...templateFeaturesStore.current,
		macros: scanMacroDefinitions(source),
		registers: scanRegisterDefinitions(source)
	};
	const face = latexFace(String.raw`\setjot{2}`, false)!;
	expect(face.dom.className).toBe('drawn-settings');
	expect([...face.dom.querySelectorAll('.drawn-setting')].map((row) => row.textContent)).toEqual([
		String.raw`setlength - \tempjot - \getlength{\jot}pt`,
		String.raw`setlength - \jot - 2pt`
	]);
});
