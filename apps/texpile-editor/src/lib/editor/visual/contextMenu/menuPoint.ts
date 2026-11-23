import type { EditorView } from 'prosemirror-view';
import { selectionFirstLine } from './selectionBox';

/** Chromium gives a menu the keyboard opened (Shift+F10, the Menu key) no button */
export function openedByKeyboard(event: MouseEvent): boolean {
	return event.button < 0;
}

/** where the menu opens and what it acts on: the pointer, or for the keyboard the place Chromium takes from a DOM
 *  selection (the canvas holds none, so Chromium would take the editor's middle) */
export function menuPoint(view: EditorView, event: MouseEvent): { x: number; y: number } {
	const line = openedByKeyboard(event) ? selectionFirstLine(view) : null;
	if (!line) return { x: event.clientX, y: event.clientY };
	// Chromium's rule: the left of its caret, a px wide and centered on the boundary, halfway down, in whole px
	return { x: Math.floor(line.left - 0.5), y: Math.floor((line.top + line.bottom) / 2) };
}
