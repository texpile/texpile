// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { visualWrapKeys } from '$lib/editor/snippets/visual/visualWrap';
import { parseSnippetFile } from '$lib/editor/snippets/file/parseSnippetFile';
import { setSnippetLayers } from '$lib/editor/snippets/file/snippetRegistry';

let view: EditorView | null = null;

afterEach(() => {
	view?.destroy();
	view = null;
});

it('a wrap snippet key wraps the selection in the visual Typst editor', () => {
	setSnippetLayers({
		global: parseSnippetFile('{ "Open point": { "scope": "typst", "wrap": "offen", "key": "Mod-Shift-o" } }', 'global'),
		project: null,
		allowedPatterns: null
	});
	const { doc } = parseTypstFile('Check this part now.\n');
	let from = 0;
	doc.descendants((node, pos) => {
		if (node.isText) from = pos + node.text!.indexOf('this');
	});
	const state = EditorState.create({ doc, plugins: [visualWrapKeys('typst')] });
	view = new EditorView(document.body, { state: state.apply(state.tr.setSelection(TextSelection.create(doc, from, from + 9))) });
	const event = new KeyboardEvent('keydown', { key: 'O', keyCode: 79, ctrlKey: true, shiftKey: true });
	expect(view.someProp('handleKeyDown', (f) => f(view!, event))).toBe(true);
	const marked: string[] = [];
	view.state.doc.descendants((node) => {
		if (node.marks.some((mk) => mk.type.name === 'call' && mk.attrs.name === 'offen')) marked.push(node.text!);
	});
	expect(marked).toEqual(['this part']);
});
