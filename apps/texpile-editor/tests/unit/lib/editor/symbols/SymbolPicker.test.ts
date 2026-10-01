// @vitest-environment jsdom
// The symbol picker as a user drives it: a modal with the search field focused, Enter on the best
// match, the arrows through the grid, Escape back to the editor, and the recent symbols first on the
// next open. The editor is a real CodeMirror view with the real Typst parser in source mode.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import SymbolPicker from '$lib/editor/symbols/SymbolPicker/SymbolPicker.svelte';
import { symbolPicker } from '$lib/editor/symbols/symbolPicker.svelte';
import { typstSymbolSet } from '$lib/languages/typst/symbols/typstSymbolSet';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { sourceCmView, viewMode } from '$lib/stores/editorStore';
import { updateUserData } from '$lib/storage/userData';

let host: HTMLDivElement;
let app: Record<string, unknown>;
let view: EditorView | null = null;

function openEditor(withCaret: string) {
	const caret = withCaret.indexOf('|');
	const doc = withCaret.slice(0, caret) + withCaret.slice(caret + 1);
	view = new EditorView({
		state: EditorState.create({ doc, selection: { anchor: caret }, extensions: [typstLanguage()] }),
		parent: document.body
	});
	ensureSyntaxTree(view.state, doc.length, 5000);
	viewMode.current = 'source';
	sourceCmView.current = view;
}

async function openPicker() {
	await symbolPicker.show(typstSymbolSet);
	flushSync();
}

const input = () => host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => [...host.querySelectorAll<HTMLElement>('[role="option"]')];
const optionNames = () => options().map((o) => o.getAttribute('aria-label')!.split(',')[0]);

function type(text: string) {
	input().value = text;
	input().dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

function press(target: EventTarget, key: string) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
	flushSync();
}

beforeEach(() => {
	updateUserData({ recentTypstSymbols: [] });
	host = document.createElement('div');
	document.body.appendChild(host);
	app = mount(SymbolPicker, { target: host }) as Record<string, unknown>;
});

afterEach(() => {
	if (symbolPicker.open) symbolPicker.close();
	unmount(app);
	host.remove();
	view?.destroy();
	view = null;
	sourceCmView.current = null;
});

describe('the picker', () => {
	it('opens as a labeled modal with the search field focused', async () => {
		openEditor('a | b');
		await openPicker();
		const dialog = host.querySelector('[role="dialog"]')!;
		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(dialog.getAttribute('aria-label')).toBeTruthy();
		expect(document.activeElement).toBe(input());
		expect(host.querySelector('[role="tablist"]')).not.toBeNull();
		expect(options().length).toBeGreaterThan(0);
	});

	it('takes the keyboard back from a menu that refocuses its trigger after the pick', async () => {
		openEditor('a | b');
		const trigger = document.body.appendChild(document.createElement('button'));
		const opening = symbolPicker.show(typstSymbolSet);
		queueMicrotask(() => trigger.focus());
		await opening;
		flushSync();
		await new Promise((resolve) => setTimeout(resolve));
		expect(document.activeElement).toBe(input());
		trigger.remove();
	});

	it('inserts the best match with Enter, written for math', async () => {
		openEditor('$ x | y $');
		await openPicker();
		type('arrow right double');
		expect(optionNames()[0]).toBe('sym.arrow.r.double');
		expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id);
		expect(host.textContent).toContain('=>');
		press(input(), 'Enter');
		expect(view!.state.doc.toString()).toBe('$ x => y $');
		expect(symbolPicker.open).toBe(false);
		expect(host.querySelector('[role="dialog"]')).toBeNull();
	});

	it('walks the grid with the arrows and picks with Enter', async () => {
		openEditor('a | b');
		await openPicker();
		type('sigma');
		const second = optionNames()[1];
		press(input(), 'ArrowDown');
		expect(document.activeElement).toBe(options()[0]);
		press(options()[0], 'ArrowRight');
		expect(document.activeElement).toBe(options()[1]);
		expect(options()[1].getAttribute('aria-selected')).toBe('true');
		press(options()[1], 'ArrowUp');
		expect(document.activeElement).toBe(input());
		press(input(), 'Enter');
		expect(second).toBe('sym.Sigma');
		expect(view!.state.doc.toString()).toBe('a Σ b');
	});

	it('closes on Escape without inserting, the caret back in the editor', async () => {
		openEditor('a | b');
		await openPicker();
		type('alpha');
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		flushSync();
		expect(symbolPicker.open).toBe(false);
		expect(view!.state.doc.toString()).toBe('a  b');
		expect(view!.dom.contains(document.activeElement)).toBe(true);
	});

	it('shows a tab when nothing is typed, and says when a search finds nothing', async () => {
		openEditor('a | b');
		await openPicker();
		const arrows = [...host.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.dataset.tab === 'arrows')!;
		arrows.click();
		flushSync();
		expect(arrows.getAttribute('aria-selected')).toBe('true');
		expect(optionNames()).toContain('sym.arrow.r');
		type('zzzzqx');
		expect(options()).toHaveLength(0);
		expect(host.textContent).toContain('No symbol matches');
	});

	it('opens on the recent symbols, most recent first', async () => {
		openEditor('a | b');
		await openPicker();
		type('alpha');
		press(input(), 'Enter');
		await openPicker();
		type('arrow.r.double');
		press(input(), 'Enter');
		await openPicker();
		expect(symbolPicker.tab).toBe('recent');
		expect(optionNames()).toEqual(['sym.arrow.r.double', 'sym.alpha']);
	});
});
