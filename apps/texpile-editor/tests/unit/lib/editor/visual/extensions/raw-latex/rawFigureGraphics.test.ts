import { describe, expect, it } from 'vitest';
import { graphicPreviews, isRawFigure } from '$lib/editor/visual/extensions/raw-latex/rawFigureGraphics';

const paths = (text: string) => graphicPreviews(text).map((preview) => preview.path);

describe('the raw figure strip', () => {
	it('shows what an img can show and nothing else', () => {
		expect(paths('\\includegraphics[width=3cm]{a.png}\\includegraphics{b}')).toEqual(['a.png', 'b']);
		expect(paths('\\includesvg{fig}')).toEqual(['fig']);
		expect(isRawFigure('\\includepdf[pages=-]{scan.pdf}')).toBe(false);
		expect(isRawFigure('\\includegraphics{x.pdf}')).toBe(false);
		expect(paths('\\includegraphics{a.png}\\includepdf{b.pdf}')).toEqual(['a.png']);
	});
});
