// @vitest-environment jsdom
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { openRenameCard, renameCard, renameCardOpen } from '$lib/editor/source/rename/renameCardTooltip';
import { renameProblemText } from '$lib/workspace/edits/renameNames';

const views: EditorView[] = [];

function openCard(name = 'sec:intro') {
	const view = new EditorView({
		state: EditorState.create({ doc: '\\label{sec:intro}', extensions: [renameCard] }),
		parent: document.body
	});
	views.push(view);
	const onRename = vi.fn();
	openRenameCard(view, { from: 7, title: 'Rename Label', name, problemOf: (n) => renameProblemText('label', n), onRename });
	const input = () => document.querySelector<HTMLInputElement>('.cm-rename-card input')!;
	const type = (value: string) => {
		input().value = value;
		input().dispatchEvent(new Event('input', { bubbles: true }));
	};
	const key = (k: string) => input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const alert = () => (flushSync(), document.querySelector('.cm-rename-card [role="alert"]')?.textContent) ?? null;
	return { view, onRename, input, type, key, alert };
}

afterEach(() => {
	for (const view of views.splice(0)) view.destroy();
});

describe('openRenameCard', () => {
	it('opens a dialog named for the kind holding the name, selected', () => {
		const { view, input } = openCard();
		expect(document.querySelector('.cm-rename-card [role="dialog"]')?.getAttribute('aria-label')).toBe('Rename Label');
		expect(input().value).toBe('sec:intro');
		expect(input().value.slice(input().selectionStart ?? 0, input().selectionEnd ?? 0)).toBe('sec:intro');
		expect(renameCardOpen(view.state)).toBe(true);
	});

	it('renames on Enter or the button, and a name left as it was renames nothing', () => {
		const a = openCard();
		a.type('sec:overview');
		a.key('Enter');
		expect(a.onRename).toHaveBeenCalledWith('sec:overview');
		expect(renameCardOpen(a.view.state)).toBe(false);
		const b = openCard();
		b.type('sec:other');
		document.querySelector<HTMLButtonElement>('.cm-rename-card button')!.click();
		expect(b.onRename).toHaveBeenCalledWith('sec:other');
		const c = openCard();
		c.key('Enter');
		expect(c.onRename).not.toHaveBeenCalled();
		expect(renameCardOpen(c.view.state)).toBe(false);
	});

	it('closes on Escape, and keeps the card with a message for an empty or invalid name until it is corrected', () => {
		const a = openCard();
		a.key('Escape');
		expect(renameCardOpen(a.view.state)).toBe(false);
		expect(a.onRename).not.toHaveBeenCalled();
		const b = openCard();
		b.type('two words');
		b.key('Enter');
		expect(b.alert()).toBeTruthy();
		expect(renameCardOpen(b.view.state)).toBe(true);
		b.type('');
		b.key('Enter');
		expect(b.alert()).toBeTruthy();
		b.type('sec:fixed');
		expect(b.alert()).toBeNull();
		b.key('Enter');
		expect(b.onRename).toHaveBeenCalledWith('sec:fixed');
	});
});
