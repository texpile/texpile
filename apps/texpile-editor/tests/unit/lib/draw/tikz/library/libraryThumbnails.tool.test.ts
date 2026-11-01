// inert unless WRITE_LIBRARY_THUMBNAILS is set: draws each library element with lualatex into the svg its tile shows
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { drawWithLualatex, hasLualatex, readLualatexFile, useLualatex } from '../../engines/lualatexEngine';
import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';
import { createFontOutlines } from '$lib/draw/editor/drawing/fontOutlines';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { LIBRARY_ELEMENTS } from '$lib/draw/tikz/library/libraryElements';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { elementPreamble } from './elementPreamble';

const OUT = process.env.THUMBS_OUT ?? join(import.meta.dirname, '../../../../../../src/lib/draw/tikz/library/thumbs');

describe.skipIf(!process.env.WRITE_LIBRARY_THUMBNAILS || !hasLualatex)('library thumbnails', () => {
	useLualatex();
	it('draws each element', async () => {
		const outlines = createFontOutlines(readLualatexFile);
		for (const e of LIBRARY_ELEMENTS) {
			// drawn heavier than on a page, as the tiles show them small
			const text = `\\begin{tikzpicture}[line width=0.8pt]\n${e.text}\n\\end{tikzpicture}`;
			const result = await drawWithLualatex(elementPreamble(e), instrumentPicture(text, readPicture(text)!));
			const fonts = await outlines.loadFonts(result.fonts);
			writeFileSync(join(OUT, `${e.id}.svg`), drawingToSvg(buildDrawing(result), fonts, outlines.outline));
		}
	}, 300_000);
});
