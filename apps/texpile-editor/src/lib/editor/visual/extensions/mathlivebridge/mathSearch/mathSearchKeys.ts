// Tab goes to the next empty slot or opens math search, Ctrl+Space opens it as in the source editor, and either
// again closes it; an open search gets keys before MathLive, and before the source editor (sourceMathSearch.ts)
import type { MathfieldElement } from 'mathlive';
import { mathSearch } from './mathSearch.svelte';
import { placeholderAhead } from '$lib/editor/snippets/visual/mathliveSnippets';

export const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);
// about as many rows as the panel shows
const PAGE = 8;

/** MathLive's own list, of LaTeX commands or of Typst names, which Tab takes from; there from the
 *  key that opens it, though it shows only a moment later */
function suggestionsShowing(): boolean {
	return document.getElementById('mathlive-suggestion-popover') !== null;
}

function plain(event: KeyboardEvent): boolean {
	return !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** Ctrl+Space, Control on macOS too, as codemirror's own key for suggestions */
export function isSearchKey(event: KeyboardEvent): boolean {
	return event.key === ' ' && event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey;
}

function isTab(event: KeyboardEvent): boolean {
	return event.key === 'Tab' && !event.shiftKey && plain(event);
}

function opensSearch(event: KeyboardEvent, field: MathfieldElement): boolean {
	return (isTab(event) || isSearchKey(event)) && field.mode === 'math' && !field.readOnly && !suggestionsShowing();
}

/** kept from MathLive, which would go back a slot, and from the browser, which would leave the equation */
function isShiftTab(event: KeyboardEvent): boolean {
	return event.key === 'Tab' && event.shiftKey && plain(event);
}

/** whether the open search takes the key; any other key closes it and goes on to the equation */
export function takeSearchKey(event: KeyboardEvent): boolean {
	if (isSearchKey(event)) {
		mathSearch.close();
		return true;
	}
	switch (event.key) {
		case 'Escape':
		case 'Tab':
			mathSearch.close();
			return true;
		case 'ArrowDown':
			mathSearch.move(1);
			return true;
		case 'ArrowUp':
			mathSearch.move(-1);
			return true;
		case 'PageDown':
			mathSearch.move(PAGE);
			return true;
		case 'PageUp':
			mathSearch.move(-PAGE);
			return true;
		case 'Enter':
			mathSearch.pick();
			return true;
		case 'Backspace':
			if (!mathSearch.backspace()) mathSearch.close();
			return true;
	}
	if (event.key.length === 1 && plain(event) && !event.isComposing) {
		mathSearch.type(event.key);
		return true;
	}
	mathSearch.close();
	return false;
}

/** the field's keydown, in the capture phase so it runs before MathLive's */
export function mathSearchKeydown(event: KeyboardEvent): void {
	const field = event.currentTarget as MathfieldElement;
	if (mathSearch.field === field) {
		// a modifier on its own is the start of a key, not one
		if (MODIFIERS.has(event.key) || !takeSearchKey(event)) return;
	} else if (opensSearch(event, field)) {
		if (isTab(event) && placeholderAhead(field)) field.executeCommand('moveToNextPlaceholder');
		else mathSearch.open(field, field.syntax === 'typst' ? 'typst' : 'latex', field.closest('.block-math-container') !== null);
	} else if (!isShiftTab(event)) return;
	event.preventDefault();
	event.stopImmediatePropagation();
}
