// the stretch of the document find tints: what the pane shows and as much again on each side. A short query matches tens
// of thousands of places in a long paper, and a decoration set of all of them took 600 ms a keystroke to build
import type { EditorView } from 'prosemirror-view';
import { visibleBox } from '../visibleBox';
import type { FindMatch } from './findMatches';

export type DocWindow = { readonly from: number; readonly to: number };

/** the positions the pane shows; a pane edge past the document (its margin above the first line) reaches its end */
export function shownRange(view: EditorView): DocWindow {
	const box = visibleBox(view.dom);
	const x = (box.left + box.right) / 2;
	const top = view.posAtCoords({ left: x, top: box.top + 1 })?.pos ?? 0;
	const bottom = view.posAtCoords({ left: x, top: box.bottom - 1 })?.pos ?? view.state.doc.content.size;
	return { from: Math.min(top, bottom), to: Math.max(top, bottom) };
}

/** the shown range with as much again on each side, so a short scroll finds its tints there */
export function windowAround(shown: DocWindow, size: number): DocWindow {
	const reach = Math.max(shown.to - shown.from, 1);
	return { from: Math.max(0, shown.from - reach), to: Math.min(size, shown.to + reach) };
}

export function holds(window: DocWindow, shown: DocWindow): boolean {
	return window.from <= shown.from && shown.to <= window.to;
}

/** the matches that reach into `window`, in order, and the current one wherever it is */
export function matchesIn(matches: readonly FindMatch[], window: DocWindow, current: FindMatch | null): FindMatch[] {
	let low = 0;
	for (let high = matches.length; low < high;) {
		const mid = (low + high) >> 1;
		if (matches[mid].to <= window.from) low = mid + 1;
		else high = mid;
	}
	const out: FindMatch[] = [];
	for (let i = low; i < matches.length && matches[i].from < window.to; i++) out.push(matches[i]);
	if (current && !out.includes(current)) out.push(current);
	return out;
}
