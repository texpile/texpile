// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { starterGhost } from '../../../../../src/lib/editor/extensions/starter-ghost/starterGhost';
import { createStarterLatex } from '../../../../../src/lib/workspace/latexRoundtrip';

let view: EditorView | null = null;

function editor(doc: string) {
	view = new EditorView({
		state: EditorState.create({
			doc,
			// same order as SourceEditor: the ghost's Tab must win over indentWithTab
			extensions: [starterGhost(), keymap.of([...defaultKeymap, indentWithTab])]
		}),
		parent: document.body
	});
	return view;
}

function pressTab(v: EditorView) {
	v.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
}

const ghostEl = () => document.querySelector('.cm-starter-ghost');

afterEach(() => {
	view?.destroy();
	view = null;
});

describe('starter ghost', () => {
	it('offers a skeleton in an empty file without writing it, until Tab accepts', () => {
		const v = editor('');
		expect(ghostEl()?.textContent).toContain('\\documentclass{article}');
		expect(v.state.doc.toString()).toBe('');
		pressTab(v);
		expect(v.state.doc.toString()).toBe(createStarterLatex());
		expect(v.state.doc.sliceString(0, v.state.selection.main.head)).toContain('\\begin{document}');
	});

	it('withdraws the offer once the file has content', () => {
		const v = editor('');
		v.dispatch({ changes: { from: 0, insert: '\\documentclass{beamer}' } });
		expect(ghostEl()).toBeFalsy();
	});

	// the Tab binding is Prec.high, so it must decline when there's no offer or it would
	// swallow indentation for every .tex in the app
	it('leaves Tab to indent when there is no offer', () => {
		const v = editor('hello');
		v.dispatch({ selection: { anchor: 5 } });
		pressTab(v);
		expect(v.state.doc.toString()).toContain('hello');
		expect(v.state.doc.toString()).not.toBe(createStarterLatex());
	});
});
