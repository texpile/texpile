import { it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { wordBeingTypedKey, wordBeingTypedPlugin } from '$lib/editor/canvas/layout/linebreak/wordBeingTyped';

function stateWith(...paragraphs: string[]): EditorState {
	const doc = schema.nodes.doc.create(
		null,
		paragraphs.map((text) => schema.nodes.paragraph.create(null, schema.text(text)))
	);
	return EditorState.create({ doc, plugins: [wordBeingTypedPlugin()] });
}

it('holds the word under the caret from the first letter typed in it until the caret leaves it', () => {
	let state = stateWith('the inter of');
	const end = 1 + 'the inter'.length;
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end)));
	expect(wordBeingTypedKey.getState(state)).toBeNull();
	state = state.apply(state.tr.insertText('n'));
	expect(wordBeingTypedKey.getState(state)).toEqual({ from: 5, to: end + 1 });
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)));
	expect(wordBeingTypedKey.getState(state)).toEqual({ from: 5, to: end + 1 });
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, end + 1)));
	state = state.apply(state.tr.insertText(' '));
	expect(wordBeingTypedKey.getState(state)).toBeNull();
	state = state.apply(state.tr.insertText('x'));
	expect(wordBeingTypedKey.getState(state)).toEqual({ from: end + 2, to: end + 3 });
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
	expect(wordBeingTypedKey.getState(state)).toBeNull();
});

it('does not take an edit somewhere else for typing at the caret', () => {
	let state = stateWith('their edit', 'my internationalization here');
	const caret = state.doc.child(0).nodeSize + 1 + 'my internationalization'.length;
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, caret)));
	state = state.apply(state.tr.insertText('s', 6));
	expect(wordBeingTypedKey.getState(state)).toBeNull();
});
