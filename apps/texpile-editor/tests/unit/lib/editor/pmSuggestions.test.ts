// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { editMode, takeTypedSides } from '$lib/comments/activeSuggestions.svelte';
import { pmSuggestions, pmSuggestionsKey, setPmSuggestions } from '$lib/editor/visual/extensions/pmSuggestions';
import { oldWordsArrowsPlugin } from '$lib/editor/visual/extensions/pmOldWordsCaret';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const SOURCE = 'Refinement is driven by an estimator.\n';
const parsed = parseLatexFile(SOURCE);

function mount() {
	const place = document.createElement('div');
	document.body.appendChild(place);
	return new EditorView(place, { state: EditorState.create({ doc: parsed.doc, plugins: [oldWordsArrowsPlugin(), pmSuggestions()] }) });
}

it('puts what is typed in front of old words when the arrow key put the caret there', () => {
	editMode.current = 'suggesting';
	const view = mount();
	const text = view.state.doc.child(0).textContent;
	const at = 1 + text.indexOf('driven');
	setPmSuggestions(view, [
		{ id: 'r', from: at, to: at + 'driven'.length, restore: 'led', old: [{ text: 'led', marks: [] }], mine: true, partial: false }
	]);
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
	takeTypedSides();

	const pressed = view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key: 'ArrowLeft' })));
	expect(pressed).toBe(true);
	expect(view.state.selection.head).toBe(at);
	view.dispatch(view.state.tr.insertText('mostly ', at));
	const [r] = pmSuggestionsKey.getState(view.state)!.ranges;
	expect(view.state.doc.textBetween(r.from, r.to)).toBe('driven');
	expect(view.state.doc.child(0).textContent).toBe('Refinement is mostly driven by an estimator.');
	expect(takeTypedSides()).toEqual({ r: 'before' });
	view.destroy();
});

it('stands the caret before the words a delete has just struck out', () => {
	editMode.current = 'suggesting';
	const view = mount();
	const end = 1 + 'Refinement is driven by an estimator.'.length;
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)));
	view.dispatch(view.state.tr.delete(end - 1, end));
	expect(pmSuggestionsKey.getState(view.state)?.caret).toEqual({ at: end - 1, side: 'before' });
	// typing is not a delete, and leaves the side to whatever the caret already said
	view.dispatch(view.state.tr.insertText('x', end - 1));
	expect(pmSuggestionsKey.getState(view.state)?.caret).toEqual({ at: end, side: 'before' });
	view.destroy();
});
