import * as Y from 'yjs';
import { finderFor } from './pictureFinders';
import type { PictureSpan } from './pictureTree';

type Anchored = { path: string; anchor: Y.RelativePosition | null; doc?: Y.Doc | null; shown?: string; number?: number };

export type FigurePlace =
	{ state: 'shown'; span: PictureSpan; number: number } | { state: 'incomplete'; at: number } | { state: 'deleted'; at: number };

const anchored = new Map<string, Anchored>();
let next = 1;

function offsetOf(a: Anchored, ytext: Y.Text): number | null {
	if (!a.anchor) return null;
	return ytext.doc ? (Y.createAbsolutePositionFromRelativePosition(a.anchor, ytext.doc)?.index ?? null) : null;
}

function anchorDeleted(a: Anchored, ytext: Y.Text): boolean {
	const id = a.anchor?.item;
	if (!id || !ytext.doc) return true;
	try {
		return Y.getItem(ytext.doc.store, id).deleted;
	} catch {
		return true;
	}
}

export function placeOf(id: string, ytext: Y.Text, text: string): FigurePlace | null {
	const a = anchored.get(id);
	// the folder closed and came back: the file's text is new, and the anchor means nothing in it
	if (a && a.doc !== ytext.doc) a.anchor = null;
	if (a && !a.anchor) {
		const picture = finderFor(a.path).all(text)[(a.number ?? 0) - 1];
		if (!picture) return { state: 'deleted', at: 0 };
		a.anchor = Y.createRelativePositionFromTypeIndex(ytext, picture.from, 0);
		a.doc = ytext.doc;
	}
	const at = a && offsetOf(a, ytext);
	if (!a || at === null || at === undefined) return null;
	const finder = finderFor(a.path);
	const span = finder.at(text, at);
	const deleted = anchorDeleted(a, ytext);
	const source = span ? text.slice(span.from, span.to) : null;
	if (span && source !== null && (!deleted || source === a.shown)) {
		if (deleted) a.anchor = Y.createRelativePositionFromTypeIndex(ytext, span.from, 0);
		a.shown = source;
		a.number = finder.all(text).findIndex((p) => p.from === span.from) + 1;
		return { state: 'shown', span, number: a.number };
	}
	return deleted ? { state: 'deleted', at } : { state: 'incomplete', at };
}

export function restoredFigure(path: string, number: number): string {
	const id = `r${number}:${path}`;
	if (!anchored.has(id)) anchored.set(id, { path, anchor: null, number });
	return id;
}

export function figureFor(path: string, ytext: Y.Text, text: string, from: number): string {
	for (const [id, a] of anchored) {
		if (a.path !== path) continue;
		const place = placeOf(id, ytext, text);
		if (place?.state === 'shown' && place.span.from === from) return id;
	}
	const id = `${next++}`;
	const span = finderFor(path).at(text, from);
	const shown = span ? text.slice(span.from, span.to) : undefined;
	anchored.set(id, { path, anchor: Y.createRelativePositionFromTypeIndex(ytext, from, 0), doc: ytext.doc, shown });
	return id;
}

export function pictureOfCard(path: string, text: string, card: { index: number; source: string }): PictureSpan | null {
	const pictures = finderFor(path).all(text);
	const source = card.source.trim();
	const atIndex = pictures[card.index];
	if (atIndex && text.slice(atIndex.from, atIndex.to) === source) return atIndex;
	return pictures.find((p) => text.slice(p.from, p.to) === source) ?? atIndex ?? null;
}
