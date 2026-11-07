// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';
import { templateFeaturesStore } from '$lib/stores/editorStore';

const face = (source: string) => latexFace(source, false);

afterEach(() => {
	templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: undefined };
});

describe('verbatim calls', () => {
	it('draws \\verb and the other verbatim commands as inline code', () => {
		expect(face(String.raw`\verb|a_b #1|`)?.dom.textContent).toBe('a_b #1');
		expect(face(String.raw`\lstinline[language=C]{int x;}`)?.dom.tagName).toBe('CODE');
		expect(face(String.raw`\verb|unclosed`)).toBeNull();
	});

	it('draws a paper’s own macro that expands to one', () => {
		templateFeaturesStore.current = { ...templateFeaturesStore.current, macros: { code: { def: '\\lstinline!#1!', args: 1 } } };
		expect(face(String.raw`\code{TEXINPUTS}`)?.dom.textContent).toBe('TEXINPUTS');
	});
});
