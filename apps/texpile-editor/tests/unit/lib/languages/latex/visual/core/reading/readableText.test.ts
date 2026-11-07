// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

it('hints a footnote with the words it prints', () => {
	const face = latexFace(String.raw`\footnote{Here $[\mathbf{C};\mathbf{D}]$ denotes the functor category of M\"uller.}`, false);
	expect(face?.dom.getAttribute('data-tip')).toBe('Here [C;D] denotes the functor category of Müller.');
});
