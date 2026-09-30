// @vitest-environment jsdom
// Ctrl+K is the command palette's in every editor: a source keymap that also took it inserted a link
// under the palette it opened.
import { afterEach, describe, expect, it } from 'vitest';
import { EditorView } from '@codemirror/view';
import { EditorState, type Extension } from '@codemirror/state';
import { typSourceShortcuts } from '$lib/languages/typst/source/sourceExtensions';
import { mdSourceShortcuts } from '$lib/languages/markdown/source/sourceExtensions';

let view: EditorView | null = null;
afterEach(() => {
	view?.destroy();
	view = null;
});

describe('source keymaps', () => {
	it.each([
		['Typst', typSourceShortcuts()],
		['Markdown', mdSourceShortcuts()]
	] as [string, Extension][])('leave Ctrl+K to the command palette in %s', (_name, shortcuts) => {
		view = new EditorView({ state: EditorState.create({ doc: 'see here', extensions: [shortcuts] }), parent: document.body });
		view.dispatch({ selection: { anchor: 4, head: 8 } });
		const key = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', keyCode: 75, ctrlKey: true, bubbles: true, cancelable: true });
		view.contentDOM.dispatchEvent(key);
		expect(key.defaultPrevented).toBe(false);
		expect(view.state.doc.toString()).toBe('see here');
	});
});
