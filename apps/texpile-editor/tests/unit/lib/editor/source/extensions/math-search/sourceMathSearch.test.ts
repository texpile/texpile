// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { autocompletion } from '@codemirror/autocomplete';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { tabIndentBinding } from '$lib/editor/source/extensions/keybindings/cmTabKey';
import { mathPreview } from '$lib/editor/source/extensions/math-preview/mathPreview';
import { settings } from '$lib/settings';

vi.mock('$lib/editor/visual/toolbar/mathInsert', () => ({ insertSymbol: vi.fn() }));
vi.mock('$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathEntries', () => ({
	loadMathEntries: () => new Promise(() => {}),
	searchMathEntries: vi.fn(() => [])
}));

const { sourceMathSearch } = await import('$lib/editor/source/extensions/math-search/sourceMathSearch');
const { mathSearch } = await import('$lib/editor/visual/extensions/mathlivebridge/mathSearch/mathSearch.svelte');

let view: EditorView | null = null;

function editor(withCaret: string): EditorView {
	const doc = withCaret.replace('|', '');
	view = new EditorView({
		state: EditorState.create({
			doc,
			selection: { anchor: withCaret.indexOf('|') },
			extensions: [latex(), mathPreview(), autocompletion(), sourceMathSearch(), keymap.of([tabIndentBinding])]
		}),
		parent: document.body
	});
	ensureSyntaxTree(view.state, doc.length, 5000);
	return view;
}

function press(v: EditorView, key: string, ctrlKey = false): void {
	v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey, bubbles: true, cancelable: true }));
}

afterEach(() => {
	mathSearch.close();
	view?.destroy();
	view = null;
});

describe('the math search in the source editor', () => {
	it('opens on Ctrl+Space in math, ahead of the suggestions', () => {
		const v = editor('$x|$');
		press(v, ' ', true);
		expect(mathSearch.source).toBe(v);
		press(v, ' ', true);
		expect(mathSearch.source).toBe(null);
	});

	it('closes when the caret goes elsewhere, so a pick never lands in the text', () => {
		const v = editor('$x|$ and text');
		press(v, ' ', true);
		v.dispatch({ selection: { anchor: v.state.doc.length } });
		expect(mathSearch.source).toBe(null);
	});

	it('leaves Tab in math to indent, as in text', () => {
		const v = editor('$x|$');
		press(v, 'Tab');
		expect(mathSearch.source).toBe(null);
		expect(v.state.doc.toString()).toMatch(/^\$x\s+\$$/);
	});

	it('leaves Ctrl+Space to the Emacs keys, where it sets the mark', () => {
		settings.current.editorKeymap = 'emacs';
		const v = editor('$x|$');
		press(v, ' ', true);
		settings.current.editorKeymap = 'default';
		expect(mathSearch.source).toBe(null);
	});

	it('stays shut on Ctrl+Space outside math', () => {
		const v = editor('see |there');
		press(v, ' ', true);
		expect(mathSearch.source).toBe(null);
	});
});
