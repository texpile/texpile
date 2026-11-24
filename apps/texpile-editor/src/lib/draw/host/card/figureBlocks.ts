// a raw block that holds one picture and nothing else is drawn as that picture's card
import type { EditorView as PMView } from 'prosemirror-view';
import type { FigureLanguage } from '$lib/draw/editor';

export function pictureOf(language: FigureLanguage, text: string): string | null {
	const pictures = language.listPictures(text);
	if (pictures.length !== 1) return null;
	const [{ from, to }] = pictures;
	const before = text.slice(0, from).trim();
	return (before === '' || before === '#') && text.slice(to).trim() === '' ? text.slice(from, to) : null;
}

export function isFigureBlock(language: FigureLanguage, text: string): boolean {
	return pictureOf(language, text) !== null;
}

export function pictureIndex(language: FigureLanguage, view: PMView, pos: number): number {
	let index = 0;
	view.state.doc.nodesBetween(0, pos, (n) => {
		if (n.type.name === 'raw_latex') index += language.listPictures(n.textContent).length;
		return n.type.name !== 'raw_latex';
	});
	return index;
}
