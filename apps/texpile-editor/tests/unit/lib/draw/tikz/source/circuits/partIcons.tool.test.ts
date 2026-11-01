// inert unless WRITE_PART_ICONS is set: draws each circuit part with lualatex into the svg its button shows
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import { drawWithLualatex, hasLualatex, readLualatexFile, useLualatex } from '../../../engines/lualatexEngine';
import { drawingToSvg } from '$lib/draw/editor/drawing/drawingSvg';
import { createFontOutlines } from '$lib/draw/editor/drawing/fontOutlines';
import { buildDrawing } from '$lib/draw/tikz/drawing/buildDrawing';
import { CIRCUIT_PARTS } from '$lib/draw/tikz/source/circuits/circuitParts';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { readPicture } from '$lib/draw/tikz/source/picture';

const OUT = process.env.THUMBS_OUT ?? join(import.meta.dirname, '../../../../../../../src/lib/draw/tikz/source/circuits/parts');

describe.skipIf(!process.env.WRITE_PART_ICONS || !hasLualatex)('circuit part icons', () => {
	useLualatex();
	it('draws each part', async () => {
		const outlines = createFontOutlines(readLualatexFile);
		for (const part of CIRCUIT_PARTS) {
			const body = part.placed === 'path' ? `\\draw (0,0) to[${part.id}] (2,0);` : `\\node[${part.id}] at (0,0) {};`;
			// drawn heavier than on a page, as the buttons show them a third of their size
			const text = `\\begin{circuitikz}[line width=1.2pt]${body}\\end{circuitikz}`;
			const result = await drawWithLualatex(
				'\\documentclass{article}\\usepackage{circuitikz}',
				instrumentPicture(text, readPicture(text)!)
			);
			const fonts = await outlines.loadFonts(result.fonts);
			writeFileSync(join(OUT, `${part.id.replaceAll(' ', '-')}.svg`), drawingToSvg(buildDrawing(result), fonts, outlines.outline));
		}
	});
});
