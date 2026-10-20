import { describe, expect, it } from 'vitest';
import { extractGraphicsPaths, isRawFigure } from '$lib/editor/visual/extensions/raw-latex/rawFigureView';

describe('the raw figure strip', () => {
	it('shows what an img can show and nothing else', () => {
		expect(extractGraphicsPaths('\\includegraphics[width=3cm]{a.png}\\includegraphics{b}')).toEqual(['a.png', 'b']);
		expect(extractGraphicsPaths('\\includesvg{fig}')).toEqual(['fig']);
		expect(isRawFigure('\\includepdf[pages=-]{scan.pdf}')).toBe(false);
		expect(isRawFigure('\\includegraphics{x.pdf}')).toBe(false);
		expect(extractGraphicsPaths('\\includegraphics{a.png}\\includepdf{b.pdf}')).toEqual(['a.png']);
	});
});
