// A figure tab's picture, held by a Yjs relative position on the `\` of its \begin: the mark moves with every edit to
// the file's text, whoever makes it, and the tree says what begins there now
import * as Y from 'yjs';
import { environmentAt, isPicture, picturesIn, type PictureSpan } from './pictureTree';

type Anchored = { path: string; anchor: Y.RelativePosition };

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

/** where the figure is now; a picture back where a deleted one was (an undo) is taken as it, and anchored again */
export function placeOf(id: string, ytext: Y.Text, text: string): FigurePlace | null {
	const a = anchored.get(id);
	const at = a && offsetOf(a, ytext);
	if (!a || at === null || at === undefined) return null;
	const span = environmentAt(text, at);
	if (isPicture(span)) {
		if (anchorDeleted(a, ytext)) a.anchor = Y.createRelativePositionFromTypeIndex(ytext, span.from, 0);
		return { state: 'shown', span, number: picturesIn(text).findIndex((p) => p.from === span.from) + 1 };
	}
	return anchorDeleted(a, ytext) ? { state: 'deleted', at } : { state: 'incomplete', at };
}

/** the figure tab for the picture at `from`: the one already open on it, else a new anchor */
export function figureFor(path: string, ytext: Y.Text, text: string, from: number): string {
	for (const [id, a] of anchored) {
		if (a.path !== path) continue;
		const place = placeOf(id, ytext, text);
		if (place?.state === 'shown' && place.span.from === from) return id;
	}
	const id = `${next++}`;
	anchored.set(id, { path, anchor: Y.createRelativePositionFromTypeIndex(ytext, from, 0) });
	return id;
}

/** the picture the paper's card stands for: its text where it is first found, else its place in the order */
export function pictureOfCard(text: string, card: { index: number; source: string }): PictureSpan | null {
	const pictures = picturesIn(text);
	const source = card.source.trim();
	return pictures.find((p) => text.slice(p.from, p.to) === source) ?? pictures[card.index] ?? null;
}
