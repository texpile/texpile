// inert unless WRITE_LIBRARY_THUMBNAILS is set: draws each library element with tinymist into the svg its tile shows
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawWithTinymist, hasTinymist, useTinymist } from '../../engines/tinymistEngine';
import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';
import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';
import { svgToDrawing } from '$lib/draw/cetz/drawing/svgToDrawing';
import { LIBRARY_ELEMENTS } from '$lib/draw/cetz/library/libraryElements';
import { instrumentPicture } from '$lib/draw/cetz/source/instrument';
import { readPicture } from '$lib/draw/cetz/source/picture';

const OUT = process.env.THUMBS_OUT ?? join(import.meta.dirname, '../../../../../../src/lib/draw/cetz/library/thumbs');

function elementCanvas(e: LibraryElement) {
	const imports = ['#import "@preview/cetz:0.4.2": ' + ['canvas', 'draw', ...e.libraries].join(', '), e.usepackage];
	const body = e.text.replace(/^/gm, '  ');
	return `${imports.filter(Boolean).join('\n')}\n\n#canvas({\n  import draw: *\n${body}\n})\n`;
}

describe.skipIf(!process.env.WRITE_LIBRARY_THUMBNAILS || !hasTinymist)('library thumbnails', () => {
	useTinymist();
	it('draws each element', async () => {
		for (const e of LIBRARY_ELEMENTS) {
			const source = elementCanvas(e);
			const result = await drawWithTinymist(instrumentPicture(source, readPicture(source)!).job);
			expect(result.errors, e.id).toEqual([]);
			const { drawing } = svgToDrawing(result.svg!);
			// CeTZ's lines are 1pt, the tiles draw them 0.8pt as TikZ's are, a thick one as much heavier
			for (const p of drawing.parts) if (p.kind === 'path') p.strokeWidth = +(p.strokeWidth * 0.8).toFixed(3);
			writeFileSync(
				join(OUT, `${e.id}.svg`),
				drawingToSvg(drawing, new Map(), () => null)
			);
		}
	}, 300_000);
});
