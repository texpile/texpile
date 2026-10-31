import { cetzLanguage } from '$lib/draw/cetz/cetzLanguage';
import { environmentAt, isPicture, picturesIn, type PictureSpan } from './pictureTree';

/** a language's pictures in a file: the one beginning at an offset, whole, and all of them in order */
export type PictureFinder = { at(text: string, at: number): PictureSpan | null; all(text: string): PictureSpan[] };

const latex: PictureFinder = {
	at(text, at) {
		const span = environmentAt(text, at);
		return isPicture(span) ? span : null;
	},
	all: picturesIn
};

// CeTZ's pictures by its own reader, until they are read off the Typst syntax tree as TikZ's are off LaTeX's
const cetz: PictureFinder = {
	at: (text, at) => cetz.all(text).find((p) => p.from === at) ?? null,
	all: (text) => cetzLanguage.listPictures(text).map((p) => ({ from: p.from, to: p.to, name: 'canvas', closed: true }))
};

export function isTypstFile(path: string): boolean {
	return /\.typ$/i.test(path);
}

export function finderFor(path: string): PictureFinder {
	return isTypstFile(path) ? cetz : latex;
}
