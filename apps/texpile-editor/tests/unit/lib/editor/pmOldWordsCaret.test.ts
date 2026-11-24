import { it, expect } from 'vitest';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { editMode } from '$lib/comments/activeSuggestions.svelte';
import { pmSuggestions, setPmSuggestions } from '$lib/editor/visual/extensions/pmSuggestions';
import { pmSuggestionsKey, type PmSuggestionsMeta } from '$lib/editor/visual/extensions/pmSuggestionsState';

const at = 1 + 'Refinement is '.length;

// a click on the old words sets the side the hit test put the caret on; typing goes there
function typedOnSide(side: 'before' | 'after'): string {
	const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, schema.text('Refinement is driven by an estimator.'))]);
	let state = EditorState.create({ doc, plugins: [pmSuggestions()] });
	const view = {
		get state() {
			return state;
		},
		dispatch(tr: Transaction) {
			state = state.apply(tr);
		}
	} as unknown as EditorView;
	setPmSuggestions(view, [
		{ id: 'r', from: at, to: at + 'driven'.length, restore: 'led', old: [{ text: 'led', marks: [] }], mine: false, partial: false }
	]);
	view.dispatch(
		state.tr
			.setSelection(TextSelection.create(state.doc, at))
			.setMeta(pmSuggestionsKey, { type: 'caret', caret: { at, side } } satisfies PmSuggestionsMeta)
	);
	view.dispatch(state.tr.insertText('X', at));
	// the old words are a widget: read the line as it is drawn
	const widgets = (pmSuggestionsKey.getState(state)?.deco.find() ?? []).filter((d) => d.from === d.to);
	const drawn = state.doc.textContent.split('');
	for (const widget of widgets.reverse()) drawn.splice(widget.from - 1, 0, 'led');
	return drawn.join('');
}

it('types on the side of old words the caret was put on', () => {
	editMode.current = 'editing';
	expect(typedOnSide('before')).toBe('Refinement is Xleddriven by an estimator.');
	expect(typedOnSide('after')).toBe('Refinement is ledXdriven by an estimator.');
});
