// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { pdfCanvas, pdfFontDocument } from '$lib/pdf-view/pdf-viewer/pdfjs-singleton';

// a canvas draws only the fonts of its own document: the one a PDF's fonts go to and the one its pages are drawn in
// must be the same, and never the window's, whose text every new font lays out again
it('draws a PDF on a canvas of the one document its fonts go to, apart from the window', () => {
	const fonts = pdfFontDocument();
	expect(fonts).not.toBe(document);
	expect(pdfFontDocument()).toBe(fonts);
	expect(document.querySelectorAll('iframe')).toHaveLength(1);
	const canvas = pdfCanvas(30, 20);
	expect(canvas.ownerDocument).toBe(fonts);
	expect([canvas.width, canvas.height]).toEqual([30, 20]);
});
