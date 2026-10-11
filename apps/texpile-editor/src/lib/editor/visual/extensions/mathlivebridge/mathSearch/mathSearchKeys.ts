// Tab in an equation moves to the next empty slot, or opens the math search when there is none, and
// Shift+Tab does nothing: the arrow keys move between a fraction's or a matrix's slots. While the
// search is open the equation keeps the focus, so the keys typed are taken here, before MathLive
// sees them, and go to the search instead.
import type { MathfieldElement } from 'mathlive';
import { mathSearch } from './mathSearch.svelte';
import { placeholderAhead } from '$lib/editor/snippets/visual/mathliveSnippets';

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);
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

function opensSearch(event: KeyboardEvent, field: MathfieldElement): boolean {
	return event.key === 'Tab' && !event.shiftKey && plain(event) && field.mode === 'math' && !field.readOnly && !suggestionsShowing();
}

/** kept from MathLive, which would go back a slot, and from the browser, which would leave the equation */
function isShiftTab(event: KeyboardEvent): boolean {
	return event.key === 'Tab' && event.shiftKey && plain(event);
}

/** whether the open search takes the key; any other key closes it and goes on to the equation */
function takeSearchKey(event: KeyboardEvent): boolean {
	switch (event.key) {
		case 'Escape':
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
		case 'Tab':
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
		// a snippet's or a structure's empty slots come first: Tab fills them in order, as in the source editor
		if (placeholderAhead(field)) field.executeCommand('moveToNextPlaceholder');
		else mathSearch.open(field, field.syntax === 'typst' ? 'typst' : 'latex');
	} else if (!isShiftTab(event)) return;
	event.preventDefault();
	event.stopImmediatePropagation();
}
