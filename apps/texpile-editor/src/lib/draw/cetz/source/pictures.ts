import type { NewPictureKind } from '$lib/draw/editor/figure/figureLanguage';
import { listPictures } from './picture';
import { closingBracket } from './syntax';

export const CETZ_IMPORT = '#import "@preview/cetz:0.4.2": canvas, draw';

/** a fresh canvas, its size fixed by an invisible rectangle */
export const NEW_CANVAS = `#canvas({
  import draw: *
  rect((0, 0), (15, 10), stroke: none)
})
`;

export const NEW_PICTURE = `${CETZ_IMPORT}\n\n${NEW_CANVAS}`;

export const NEW_PICTURES: NewPictureKind[] = [{ id: 'canvas', name: 'Canvas', text: NEW_CANVAS, usepackage: null, libraries: [] }];

/** a canvas begun and never closed, and the line it begins on */
export function unclosedPicture(source: string) {
	for (const m of source.matchAll(/(?<![\w.-])(?:cetz\.)?canvas\s*\(/g)) {
		if (closingBracket(source, m.index! + m[0].length - 1) < 0)
			return { open: m[0], close: ')', line: source.slice(0, m.index!).split('\n').length };
	}
	return null;
}

/** the text with CeTZ imported, as `canvas` and `draw`, when nothing imports it */
function withImport(source: string) {
	return /@preview\/cetz:/.test(source) ? source : `${CETZ_IMPORT}\n\n${source}`;
}

/** the text with a canvas last in it, when it has none */
export function withPicture(source: string) {
	if (listPictures(source).length) return source;
	const body = source.trimEnd();
	return withImport(`${body}${body ? '\n\n' : ''}${NEW_CANVAS}`);
}

/** a canvas of `kind` in place of the first one, or last when there is none */
export function replacePicture(source: string, kind: NewPictureKind) {
	const first = listPictures(source)[0];
	const canvas = kind.text.replace(/^#/, '').trimEnd();
	if (!first) return withPicture(source).replace(NEW_CANVAS.replace(/^#/, '').trimEnd(), canvas);
	return withImport(source.slice(0, first.from) + canvas + source.slice(first.to));
}
