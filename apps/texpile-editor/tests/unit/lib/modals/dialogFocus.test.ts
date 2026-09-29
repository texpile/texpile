// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { takeFocus } from '$lib/modals/dialogFocus';

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = '';
});

function setUp() {
	vi.useFakeTimers();
	const box = document.body.appendChild(document.createElement('textarea'));
	box.focus();
	const card = document.body.appendChild(document.createElement('div'));
	card.tabIndex = -1;
	return { box, card };
}

it('takes the keyboard from the field behind, and gives it back when closed', () => {
	const { box, card } = setUp();
	const focus = takeFocus(card);
	vi.runAllTimers();
	expect(document.activeElement).toBe(card);
	card.remove();
	focus.destroy();
	vi.runAllTimers();
	expect(document.activeElement).toBe(box);
});

it('leaves a field the dialog focused itself, and focus the dialog put elsewhere', () => {
	const { card } = setUp();
	const field = card.appendChild(document.createElement('input'));
	const focus = takeFocus(card);
	field.focus();
	vi.runAllTimers();
	expect(document.activeElement).toBe(field);
	const editor = document.body.appendChild(document.createElement('input'));
	editor.focus();
	card.remove();
	focus.destroy();
	vi.runAllTimers();
	expect(document.activeElement).toBe(editor);
});
