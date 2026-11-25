import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { Decoration } from 'prosemirror-view';
import { heldProofreadRanges, typedWordKey, typedWordPlugin } from '$lib/editor/spellcheck/proofreadHold';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';

function stateWith(text: string, caret: number): EditorState {
	const doc = schema.node('doc', null, [schema.nodes.paragraph.create(null, schema.text(text))]);
	return EditorState.create({ doc, selection: TextSelection.create(doc, caret), plugins: [typedWordPlugin] });
}

describe('the typed word and the proofread marks it holds', () => {
	it('holds only the marks over the word being typed', () => {
		// "We recieve teh" with the caret at the end of "recieve", one letter just typed
		let state = stateWith('We reciev teh', 1 + 'We reciev'.length);
		state = state.apply(state.tr.insertText('e'));
		const word = typedWordKey.getState(state) ?? null;
		expect(word).toEqual({ from: 1 + 'We '.length, to: 1 + 'We recieve'.length });
		const marks = [Decoration.inline(4, 11, { class: 'proofread-spelling' }), Decoration.inline(12, 15, { class: 'proofread-spelling' })];
		expect(heldProofreadRanges(marks, word).map((mark) => mark.from)).toEqual([4]);
	});

	it('lets a space, an arrow or a click show the mark again', () => {
		let state = stateWith('We reciev', 1 + 'We reciev'.length);
		state = state.apply(state.tr.insertText('e'));
		expect(typedWordKey.getState(state)).not.toBeNull();
		const spaced = state.apply(state.tr.insertText(' '));
		expect(typedWordKey.getState(spaced)).toBeNull();
		const moved = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)));
		expect(typedWordKey.getState(moved), 'none after a selection-only transaction').toBeNull();
	});

	it('holds a word a letter is typed inside until the caret moves', () => {
		let state = stateWith('We recive', 1 + 'We reci'.length);
		state = state.apply(state.tr.insertText('e'));
		expect(typedWordKey.getState(state)).toEqual({ from: 4, to: 4 + 'recieve'.length - 1 + 1 });
		state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.selection.head + 1)));
		expect(typedWordKey.getState(state)).toBeNull();
	});
});
