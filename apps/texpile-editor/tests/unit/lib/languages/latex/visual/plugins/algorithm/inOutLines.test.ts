// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { scanMacroDefinitions } from '$lib/editor/source/extensions/math-preview/userMacros';
import { templateFeaturesStore } from '$lib/stores/editorStore';

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
});

it('draws algorithm2e input and output lines with the keyword the document defined, in bold', () => {
	const source = String.raw`\SetKwInOut{Input}{Input}\SetKwInOut{Output}{Learned}`;
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: scanMacroDefinitions(source) };
	const face = latexFace(String.raw`\Input{ the data $x$}`, false)!;
	expect(face.dom.textContent).toBe('Input: the data ');
	expect(face.dom.querySelector('[role="math"]')).not.toBeNull();
	expect(face.dom.querySelector('[style*="700"]')?.textContent).toBe('Input:');
	expect(latexFace(String.raw`\Output{ result}`, false)?.dom.textContent).toBe('Learned: result');
});
