import type { NewPictureKind } from '$lib/draw/editor/figure/figureLanguage';
import { listPictures } from './picture';
import { closingBracket } from './syntax';

export const CETZ_IMPORT = '#import "@preview/cetz:0.4.2": canvas, draw';

export const NEW_CANVAS = `#canvas({
  import draw: *
  rect((0, 0), (15, 10), stroke: none)
})
`;

export const NEW_PICTURE = `${CETZ_IMPORT}\n\n${NEW_CANVAS}`;

export const NEW_PICTURES: NewPictureKind[] = [{ id: 'canvas', name: 'Canvas', text: NEW_CANVAS, usepackage: null, libraries: [] }];

export function unclosedPicture(source: string) {
	for (const m of source.matchAll(/(?<![\w.-])(?:cetz\.)?canvas\s*\(/g)) {
		if (closingBracket(source, m.index! + m[0].length - 1) < 0)
			return { open: m[0], close: ')', line: source.slice(0, m.index!).split('\n').length };
	}
	return null;
}

export function importsCetz(source: string) {
	return /@preview\/cetz:/.test(source);
}

function withImport(source: string) {
	return importsCetz(source) ? source : `${CETZ_IMPORT}\n\n${source}`;
}

export function withPicture(source: string) {
	if (listPictures(source).length) return source;
	const body = source.trimEnd();
	return withImport(`${body}${body ? '\n\n' : ''}${NEW_CANVAS}`);
}

export function replacePicture(source: string, kind: NewPictureKind, index = 0) {
	const old = listPictures(source)[index];
	const canvas = kind.text.replace(/^#/, '').trimEnd();
	if (!old) return withPicture(source).replace(NEW_CANVAS.replace(/^#/, '').trimEnd(), canvas);
	return withImport(source.slice(0, old.from) + canvas + source.slice(old.to));
}
