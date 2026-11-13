// a visual editor held as it is drawn while its column's width moves, under its pane's cover (resizeCover),
// then let go with the text that was in view still there
import type { EditorView } from 'prosemirror-view';

type ReadingPlace = { scroller: HTMLElement; pos: number; top: number };

function scrollerOf(dom: HTMLElement): HTMLElement | null {
	for (let el = dom.parentElement; el; el = el.parentElement) {
		const overflow = getComputedStyle(el).overflowY;
		if (overflow === 'auto' || overflow === 'scroll') return el;
	}
	return null;
}

// Blink's scroll anchoring gives up when a width on the way to its anchor changes, as the hold's does
function readingPlace(view: EditorView): ReadingPlace | null {
	const scroller = scrollerOf(view.dom);
	if (!scroller || scroller.scrollTop === 0) return null;
	const pane = scroller.getBoundingClientRect();
	const page = view.dom.getBoundingClientRect();
	const hit = view.posAtCoords({ left: (Math.max(pane.left, page.left) + Math.min(pane.right, page.right)) / 2, top: pane.top + 4 });
	return hit ? { scroller, pos: hit.pos, top: view.coordsAtPos(hit.pos).top } : null;
}

/** fired on the editor's element as it is held: what floats over its text, the block handle for one, goes */
export const EDITOR_HELD = 'texpile:editor-held';

const held = new WeakSet<EditorView>();

export function isEditorHeld(view: EditorView): boolean {
	return held.has(view);
}

export function holdEditor(view: EditorView): void {
	held.add(view);
	view.dom.dispatchEvent(new Event(EDITOR_HELD));
	const width = `${view.dom.getBoundingClientRect().width}px`;
	view.dom.style.setProperty('width', width);
	view.dom.style.setProperty('min-width', width);
}

/** `redraw` draws the editor for the width its column has now */
export function releaseEditor(view: EditorView, redraw: () => void): void {
	held.delete(view);
	const place = view.dom.style.width ? readingPlace(view) : null;
	view.dom.style.removeProperty('width');
	view.dom.style.removeProperty('min-width');
	redraw();
	if (!place || view.isDestroyed) return;
	const pos = Math.min(place.pos, view.state.doc.content.size);
	place.scroller.scrollTop += view.coordsAtPos(pos).top - place.top;
}
