// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { latexFace } from '$lib/languages/latex/visual/core/walk/drawUnits';

describe('a color in a chip', () => {
	it('draws a cell color as the color it names', () => {
		const face = latexFace('\\cellcolor{header_color}', false);
		expect(face?.dom.textContent).toBe('header_color');
		expect(latexFace('\\rowcolor{red}', false)?.dom.querySelector('.drawn-color-swatch')).not.toBeNull();
	});
});
