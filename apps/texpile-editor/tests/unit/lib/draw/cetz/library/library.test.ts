// every element, in a canvas of its own with what it imports, compiles and draws
import { describe, expect, it } from 'vitest';
import { drawWithTinymist, hasTinymist, useTinymist } from '../../engines/tinymistEngine';
import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';
import { svgToDrawing } from '$lib/draw/cetz/drawing/svgToDrawing';
import { LIBRARY_ELEMENTS } from '$lib/draw/cetz/library/libraryElements';
import { instrumentPicture } from '$lib/draw/cetz/source/instrument';
import { readPicture } from '$lib/draw/cetz/source/picture';

function elementCanvas(e: LibraryElement) {
	const imports = ['#import "@preview/cetz:0.4.2": ' + ['canvas', 'draw', ...e.libraries].join(', '), e.usepackage];
	const body = e.text.replace(/^/gm, '  ');
	return `${imports.filter(Boolean).join('\n')}\n\n#canvas({\n  import draw: *\n${body}\n})\n`;
}

describe('the library', () => {
	useTinymist();

	it('has each element once, with a thumb', () => {
		const ids = LIBRARY_ELEMENTS.map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const e of LIBRARY_ELEMENTS) expect(e.thumb, e.id).toMatch(new RegExp(`/thumbs/${e.id}\\.svg$`));
	});

	it.skipIf(!hasTinymist)(
		'draws each element without an error',
		async () => {
			for (const e of LIBRARY_ELEMENTS) {
				const source = elementCanvas(e);
				const result = await drawWithTinymist(instrumentPicture(source, readPicture(source)!).job);
				expect(result.errors, `${e.id}\n${source}`).toEqual([]);
				const { drawing } = svgToDrawing(result.svg!);
				expect(drawing.parts.length, e.id).toBeGreaterThan(0);
				expect(drawing.unsupported, e.id).toEqual([]);
			}
		},
		120_000
	);
});
