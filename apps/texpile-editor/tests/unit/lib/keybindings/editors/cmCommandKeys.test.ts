// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { typSourceShortcuts } from '$lib/languages/typst/source/sourceExtensions';
import { applyUserKeybindings } from '$lib/keybindings/keybindings.svelte';

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
	applyUserKeybindings(null);
});

function press(key: string, code: string, init: KeyboardEventInit = {}): string {
	view = new EditorView({ state: EditorState.create({ doc: 'see here', extensions: [typSourceShortcuts()] }), parent: document.body });
	view.dispatch({ selection: { anchor: 4, head: 8 } });
	view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...init }));
	const text = view.state.doc.toString();
	view.destroy();
	view = null;
	return text;
}

describe("an editor's own keys", () => {
	it('run on the default key', () => {
		expect(press('b', 'KeyB', { ctrlKey: true })).toBe('see *here*');
	});

	it('follow keybindings.json, which can move a key and take the old one away', () => {
		applyUserKeybindings([
			{ key: 'mod+j', command: 'editor.bold' },
			{ key: 'mod+b', command: '-editor.bold' }
		]);
		expect(press('j', 'KeyJ', { ctrlKey: true })).toBe('see *here*');
		expect(press('b', 'KeyB', { ctrlKey: true })).toBe('see here');
	});
});
