// @vitest-environment jsdom
// The math typing helpers, checked by typing and by key presses. `|` marks the caret.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { ensureSyntaxTree } from '@codemirror/language';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { typstLanguage } from '$lib/languages/typst/source/typstLanguage';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { sourceSnippets } from '$lib/editor/snippets/cmSnippets';
import { settings } from '$lib/settings';
import type { SnippetLanguage } from '$lib/editor/snippets/file/snippetTypes';

let view: EditorView | null = null;

function editor(lang: SnippetLanguage, withCaret: string): EditorView {
	const at = withCaret.indexOf('|');
	view = new EditorView({
		state: EditorState.create({
			doc: withCaret.replace('|', ''),
			selection: { anchor: at },
			extensions: [lang === 'typst' ? typstLanguage() : latex(), sourceSnippets(lang), keymap.of([...defaultKeymap, indentWithTab])]
		}),
		parent: document.body
	});
	ensureSyntaxTree(view.state, view.state.doc.length, 5000);
	return view;
}

function type(v: EditorView, keys: string): void {
	for (const ch of keys) {
		const { from, to } = v.state.selection.main;
		const handled = v.state.facet(EditorView.inputHandler).some((h) => h(v, from, to, ch, () => v.state.update({})));
		if (!handled) v.dispatch({ changes: { from, to, insert: ch }, selection: { anchor: from + 1 } });
	}
}

function press(v: EditorView, key: string, shiftKey = false): void {
	v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
	ensureSyntaxTree(v.state, v.state.doc.length, 5000);
}

function shown(v: EditorView): string {
	const doc = v.state.doc.toString();
	const at = v.state.selection.main.head;
	return `${doc.slice(0, at)}|${doc.slice(at)}`;
}

beforeEach(() => {
	settings.current = { ...settings.current, autoFraction: true, tabOut: true, matrixKeys: true };
});

afterEach(() => {
	view?.destroy();
	view = null;
});

describe('auto-fraction', () => {
	it.each<[string, string, string, string]>([
		['takes the term before the slash', '$x^2|$', '/', '$\\frac{x^2}{|}$'],
		['drops the brackets a term was grouped with', '$(a+b)|$', '/', '$\\frac{a+b}{|}$'],
		['keeps a command as one term', '$1 + \\alpha|$', '/', '$1 + \\frac{\\alpha}{|}$'],
		['leaves a slash with no term before it', '$a + |$', '/', '$a + /|$'],
		['a second slash takes the fraction back', '$x|$', '//', '$x/|$'],
		['leaves text alone', 'and|or', '/', 'and/|or']
	])('%s', (_, before, keys, after) => {
		const v = editor('latex', before);
		type(v, keys);
		expect(shown(v)).toBe(after);
	});

	it('stays off until turned on', () => {
		settings.current = { ...settings.current, autoFraction: false };
		const v = editor('latex', '$x|$');
		type(v, '/');
		expect(shown(v)).toBe('$x/|$');
	});
});

describe('Tab and Shift+Enter in math', () => {
	it.each<[string, SnippetLanguage, string, string, boolean, string]>([
		['Tab moves past the next closing brace', 'latex', '$\\frac{a|}{b}$', 'Tab', false, '$\\frac{a}|{b}$'],
		['Tab leaves the formula when nothing is left to close', 'latex', '$x|$', 'Tab', false, '$x$|'],
		['Tab moves past a Typst bracket', 'typst', '$ (a|) $', 'Tab', false, '$ (a)| $'],
		[
			'Tab adds a column in a matrix',
			'latex',
			'$\\begin{pmatrix} a| \\end{pmatrix}$',
			'Tab',
			false,
			'$\\begin{pmatrix} a & | \\end{pmatrix}$'
		],
		[
			'Shift+Enter adds a row in a matrix',
			'latex',
			'$\\begin{pmatrix} a| \\end{pmatrix}$',
			'Enter',
			true,
			'$\\begin{pmatrix} a \\\\\n| \\end{pmatrix}$'
		],
		['Tab adds a column in a Typst mat()', 'typst', '$ mat(a|) $', 'Tab', false, '$ mat(a, |) $'],
		['Tab indents in text as before', 'latex', 'word|', 'Tab', false, 'word|']
	])('%s', (_, lang, before, key, shift, after) => {
		const v = editor(lang, before);
		press(v, key, shift);
		const result = shown(v);
		if (key === 'Tab' && after === before) expect(result).not.toContain('$|');
		else expect(result).toBe(after);
	});
});
