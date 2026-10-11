// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { visualWrapKeys } from '$lib/editor/snippets/visual/visualWrap';
import { setCallWrappers } from '$lib/editor/snippets/visual/callWrappers';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { setSnippetLayers } from '$lib/editor/snippets/file/snippetRegistry';

let view: EditorView | null = null;

afterEach(() => {
	view?.destroy();
	view = null;
	setCallWrappers('typst', []);
});

function pressWrapKey(): string[] {
	setSnippetLayers({
		global: parseSnippetFile('{ "Open point": { "scope": "typst", "wrap": "offen", "key": "Mod-Shift-o" } }', 'global'),
		project: null,
		allowedPatterns: null
	});
	const { doc } = parseTypstFile('Check this part now.\n');
	const from = 1 + 'Check '.length;
	const state = EditorState.create({ doc, plugins: [visualWrapKeys('typst')] });
	view = new EditorView(document.body, { state: state.apply(state.tr.setSelection(TextSelection.create(doc, from, from + 9))) });
	const event = new KeyboardEvent('keydown', { key: 'O', keyCode: 79, ctrlKey: true, shiftKey: true });
	expect(view.someProp('handleKeyDown', (f) => f(view!, event))).toBe(true);
	const found: string[] = [];
	view.state.doc.descendants((node) => {
		if (node.type.name === 'inline_latex') found.push(`chip:${node.textContent}`);
		else if (node.marks.some((mk) => mk.type.name === 'call')) found.push(`call:${node.text}`);
	});
	return found;
}

it('a wrap key in the visual editor draws the call when a snippet gives it a look', () => {
	setCallWrappers('typst', ['offen']);
	expect(pressWrapKey()).toEqual(['call:this part']);
});

it('a wrap key in the visual editor makes a raw chip of the call when nothing gives it a look', () => {
	expect(pressWrapKey()).toEqual(['chip:#offen[this part]']);
});
