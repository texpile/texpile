// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { documentCountStore } from '$lib/stores/countStore.svelte';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';

describe('the visual word count', () => {
	it('keeps the words on either side of a line break apart', () => {
		const { doc } = markdownToProseMirror('one two\\\nthree four  \nfive\n');
		new EditorView(document.createElement('div'), { state: EditorState.create({ doc, plugins: [createWordCountPlugin()] }) }).destroy();
		expect(documentCountStore.words).toBe(5);
		expect(documentCountStore.charactersWithSpaces).toBe('one two three four five'.length);
	});

	// a Typst paper opens on its set rule selected whole, and read "0 of 114 words" until the first click
	it('counts no selection for a block selected whole that holds no words', () => {
		const { doc } = parseTypstFile('#set page(paper: "a4")\n\nThin films conduct heat.\n');
		expect(doc.firstChild?.type.name).toBe('raw_latex');
		const selection = NodeSelection.create(doc, 0);
		new EditorView(document.createElement('div'), {
			state: EditorState.create({ doc, selection, plugins: [createWordCountPlugin()] })
		}).destroy();
		expect(documentCountStore.selectionWords).toBeNull();
	});
});
