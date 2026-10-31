// inert unless WRITE_STARTER_THUMBNAILS is set: draws each starting picture with lualatex into the svg its card
// shows, so the cards need no engine of their own
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { drawWithLualatex, hasLualatex, readLualatexFile, useLualatex } from '../../engines/lualatexEngine';
import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';
import { createFontOutlines } from '$lib/draw/editor/drawing/fontOutlines';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';
import { STARTER_PICTURES } from '$lib/draw/tikz/starters/starterPictures';

const OUT = process.env.THUMBS_OUT ?? join(import.meta.dirname, '../../../../../../src/lib/draw/tikz/starters/thumbs');

describe.skipIf(!process.env.WRITE_STARTER_THUMBNAILS || !hasLualatex)('starter thumbnails', () => {
	useLualatex();
	it('draws each starting picture', async () => {
		const outlines = createFontOutlines(readLualatexFile);
		for (const kind of STARTER_PICTURES.filter((k) => k.thumb)) {
			const preamble = [
				'\\documentclass{article}\\usepackage{tikz}',
				kind.usepackage && `\\usepackage{${kind.usepackage}}`,
				kind.usepackage === 'pgfplots' && '\\pgfplotsset{compat=1.18}',
				kind.libraries.length && `\\usetikzlibrary{${kind.libraries.join(',')}}`
			]
				.filter(Boolean)
				.join('\n');
			const result = await drawWithLualatex(preamble, instrumentPicture(kind.text, readPicture(kind.text)!));
			const fonts = await outlines.loadFonts(result.fonts);
			writeFileSync(join(OUT, `${kind.id}.svg`), drawingToSvg(buildDrawing(result), fonts, outlines.outline));
		}
	});
});
