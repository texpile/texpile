// A figure tab's picture, held by a Yjs relative position on its first character (the `\` of \begin, the `#` of a
// canvas): the mark moves with every edit to the file's text, whoever makes it, and the language says what begins there
import * as Y from 'yjs';
import { finderFor } from './pictureFinders';
import type { PictureSpan } from './pictureTree';

/** `shown`: the picture's text when last found, which a picture back after a deletion must match */
type Anchored = { path: string; anchor: Y.RelativePosition; shown?: string };

export type FigurePlace =
	{ state: 'shown'; span: PictureSpan; number: number } | { state: 'incomplete'; at: number } | { state: 'deleted'; at: number };

const anchored = new Map<string, Anchored>();
let next = 1;

function offsetOf(a: Anchored, ytext: Y.Text): number | null {
	return ytext.doc ? (Y.createAbsolutePositionFromRelativePosition(a.anchor, ytext.doc)?.index ?? null) : null;
}

function anchorDeleted(a: Anchored, ytext: Y.Text): boolean {
	const id = a.anchor.item;
	if (!id || !ytext.doc) return true;
	try {
		return Y.getItem(ytext.doc.store, id).deleted;
	} catch {
		return true;
	}
}

/** where the figure is now; the same picture back where a deleted one was (an undo) is taken as it, and anchored again */
export function placeOf(id: string, ytext: Y.Text, text: string): FigurePlace | null {
	const a = anchored.get(id);
	const at = a && offsetOf(a, ytext);
	if (!a || at === null || at === undefined) return null;
	const finder = finderFor(a.path);
	const span = finder.at(text, at);
	const deleted = anchorDeleted(a, ytext);
	const source = span ? text.slice(span.from, span.to) : null;
	if (span && source !== null && (!deleted || source === a.shown)) {
		if (deleted) a.anchor = Y.createRelativePositionFromTypeIndex(ytext, span.from, 0);
		a.shown = source;
		return { state: 'shown', span, number: finder.all(text).findIndex((p) => p.from === span.from) + 1 };
	}
	return deleted ? { state: 'deleted', at } : { state: 'incomplete', at };
}

/** the figure tab for the picture at `from`: the one already open on it, else a new anchor */
export function figureFor(path: string, ytext: Y.Text, text: string, from: number): string {
	for (const [id, a] of anchored) {
		if (a.path !== path) continue;
		const place = placeOf(id, ytext, text);
		if (place?.state === 'shown' && place.span.from === from) return id;
	}
	const id = `${next++}`;
	const span = finderFor(path).at(text, from);
	const shown = span ? text.slice(span.from, span.to) : undefined;
	anchored.set(id, { path, anchor: Y.createRelativePositionFromTypeIndex(ytext, from, 0), shown });
	return id;
}

/** the picture the paper's card stands for: its place in the order while its text is there, else its text */
export function pictureOfCard(path: string, text: string, card: { index: number; source: string }): PictureSpan | null {
	const pictures = finderFor(path).all(text);
	const source = card.source.trim();
	const atIndex = pictures[card.index];
	if (atIndex && text.slice(atIndex.from, atIndex.to) === source) return atIndex;
	return pictures.find((p) => text.slice(p.from, p.to) === source) ?? atIndex ?? null;
}
