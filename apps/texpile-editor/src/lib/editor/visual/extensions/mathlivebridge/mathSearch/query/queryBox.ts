// the math search's query as a one-line text box: the equation keeps the focus, so its keys edit this
export type QueryBox = { text: string; anchor: number; head: number };

export const EMPTY_QUERY: QueryBox = { text: '', anchor: 0, head: 0 };

export function selectionStart(box: QueryBox): number {
	return Math.min(box.anchor, box.head);
}

export function selectionEnd(box: QueryBox): number {
	return Math.max(box.anchor, box.head);
}

export function selectedText(box: QueryBox): string {
	return box.text.slice(selectionStart(box), selectionEnd(box));
}

export function replaceSelection(box: QueryBox, insert: string): QueryBox {
	const at = selectionStart(box) + insert.length;
	return { text: box.text.slice(0, selectionStart(box)) + insert + box.text.slice(selectionEnd(box)), anchor: at, head: at };
}

export function wordBefore(text: string, pos: number): number {
	return pos - /\S*\s*$/.exec(text.slice(0, pos))![0].length;
}

export function wordAfter(text: string, pos: number): number {
	return pos + /^\s*\S*/.exec(text.slice(pos))![0].length;
}

/** the caret to `pos`, or the selection's head with `extend` */
export function moveTo(box: QueryBox, pos: number, extend: boolean): QueryBox {
	const head = Math.max(0, Math.min(box.text.length, pos));
	return { text: box.text, anchor: extend ? box.anchor : head, head };
}

/** Left and Right: a selection collapses to its own edge before the caret moves */
export function moveBy(box: QueryBox, step: -1 | 1, word: boolean, extend: boolean): QueryBox {
	if (!extend && !word && box.anchor !== box.head) return moveTo(box, step < 0 ? selectionStart(box) : selectionEnd(box), false);
	const to = word ? (step < 0 ? wordBefore : wordAfter)(box.text, box.head) : box.head + step;
	return moveTo(box, to, extend);
}

/** Backspace and Delete: the selection, or the character or word on that side of the caret */
export function deleteBy(box: QueryBox, step: -1 | 1, word: boolean): QueryBox {
	if (box.anchor !== box.head) return replaceSelection(box, '');
	const to = word ? (step < 0 ? wordBefore : wordAfter)(box.text, box.head) : box.head + step;
	return replaceSelection(moveTo(box, to, true), '');
}

export function selectAll(box: QueryBox): QueryBox {
	return { text: box.text, anchor: 0, head: box.text.length };
}
