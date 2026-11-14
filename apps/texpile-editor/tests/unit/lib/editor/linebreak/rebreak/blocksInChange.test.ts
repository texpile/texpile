import { it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { textBlocksInChange } from '$lib/editor/visual/linebreak/rebreak/blocksInChange';

function stateWith(...paragraphs: string[]): EditorState {
	const doc = schema.nodes.doc.create(
		null,
		paragraphs.map((text) => schema.nodes.paragraph.create(null, schema.text(text)))
	);
	return EditorState.create({ doc });
}

it('names the paragraph that was put into a quote, and only the typed one after typing', () => {
	const state = stateWith('first', 'second', 'third');
	const second = state.doc.child(1);
	const range = state.doc.resolve(8).blockRange()!;
	const quoted = state.apply(state.tr.wrap(range, [{ type: schema.nodes.blockquote }]));
	expect(textBlocksInChange(state.doc, quoted.doc)).toEqual([second]);
	expect(textBlocksInChange(state.doc, quoted.doc)[0]).toBe(second);

	const typed = state.apply(state.tr.insertText('x', 9));
	const blocks = textBlocksInChange(state.doc, typed.doc);
	expect(blocks).toHaveLength(1);
	expect(blocks[0]).not.toBe(second);
});
