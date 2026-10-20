import { describe, expect, it } from 'vitest';
import { graphicExtensionsFor } from '$lib/languages/latex/knowledge/registries/graphicExtensions';
import { sidecarExtensions } from '$lib/languages/latex/knowledge/registries/sidecarExtensions';

describe('graphicExtensionsFor', () => {
	it('reads pdflatex when the command names no engine, .pdf first', () => {
		expect(graphicExtensionsFor(null)).toEqual(graphicExtensionsFor('pdflatex'));
		expect(graphicExtensionsFor('pdflatex')[0]).toBe('.pdf');
	});

	it('gives each engine its own formats', () => {
		expect(graphicExtensionsFor('xelatex')).toContain('.bmp');
		expect(graphicExtensionsFor('pdflatex')).not.toContain('.bmp');
	});
});

describe('sidecarExtensions', () => {
	it('lists the aux files and the float list files', () => {
		expect(sidecarExtensions()).toEqual(expect.arrayContaining(['aux', 'bbl', 'run.xml', 'synctex.gz', 'lof', 'lot', 'lol']));
	});
});
