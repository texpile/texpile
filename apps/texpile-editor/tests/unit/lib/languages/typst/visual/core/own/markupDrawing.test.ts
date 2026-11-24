// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { FaceElement } from '$lib/editor/canvas';
import { drawTypstMarkup } from '$lib/languages/typst/visual/core/own/markupDrawing';

it('draws markup with canvas elements, a formula in it too', () => {
	const words = drawTypstMarkup('Hello *bold*', () => null);
	expect(words?.dom).toBeInstanceOf(FaceElement);
	expect(words?.dom.querySelector('strong')?.textContent).toBe('bold');
	const formula = drawTypstMarkup('Hello $x$', () => null);
	expect(formula?.dom).toBeInstanceOf(FaceElement);
	expect(formula?.dom.querySelector('[role="math"]')?.getAttribute('aria-label')).toBe('x');
});
