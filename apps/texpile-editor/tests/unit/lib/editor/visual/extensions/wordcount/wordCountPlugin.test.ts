// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import { documentCountStore } from '$lib/stores/countStore.svelte';
import { markdownToProseMirror } from '$lib/languages/markdown/visual/converter';

describe('the visual word count', () => {
	it('keeps the words on either side of a line break apart', () => {
		const { doc } = markdownToProseMirror('one two\\\nthree four  \nfive\n');
		new EditorView(document.createElement('div'), { state: EditorState.create({ doc, plugins: [createWordCountPlugin()] }) }).destroy();
		expect(documentCountStore.words).toBe(5);
		expect(documentCountStore.charactersWithSpaces).toBe('one two three four five'.length);
	});
});
