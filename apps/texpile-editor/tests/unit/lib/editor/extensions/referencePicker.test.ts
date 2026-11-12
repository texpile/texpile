// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import {
	hideReferencePicker,
	selectReferenceAt,
	showReferencePicker
} from '$lib/editor/visual/extensions/reference/referencePicker.svelte';
import type { ReferenceItem } from '$lib/editor/visual/extensions/reference/referenceItems';

const items = Array.from({ length: 30 }, (_, n): ReferenceItem => ({
	id: `key${n}`,
	type: 'section',
	displayText: `Entry ${n}`,
	payload: { label: `key${n}`, number: n, position: n }
}));
const view = { dom: document.body, coordsAtPos: () => ({ left: 0, right: 0, top: 0, bottom: 10 }) } as unknown as EditorView;
const firstRow = () => document.querySelector('.reference-picker-container button');

afterEach(hideReferencePicker);

// every arrow key mounted the menu again, so its list was back at the top with the selected entry out of sight
it('keeps its list and brings the selected entry into view as the arrows move', () => {
	const broughtIntoView = vi.fn();
	HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
		broughtIntoView(this.textContent?.trim());
	};
	showReferencePicker(view, 1, items, '', () => {});
	flushSync();
	const row = firstRow();
	selectReferenceAt(20);
	flushSync();
	expect(firstRow()).toBe(row);
	expect(broughtIntoView).toHaveBeenLastCalledWith('Entry 20');
});
