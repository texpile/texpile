// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { clearOfOldWords, cmSuggestions, liveSuggestionRanges, setSuggestionRanges } from '$lib/editor/source/cmSuggestions';
import { editMode, takeTypedSides } from '$lib/comments/activeSuggestions.svelte';

it('draws a flag across old words in two pieces', () => {
	const doc = 'driven by an estimator of the error';
	let state = EditorState.create({ doc, extensions: [cmSuggestions()] });
	const cut = doc.indexOf('estimator');
	state = state.update({ effects: setSuggestionRanges.of([{ id: 'del', from: cut, to: cut, restore: 'adaptive ', mine: false }]) }).state;
	const flag = Decoration.mark({ class: 'proofread-spelling' });
	const set = Decoration.set([flag.range(0, doc.indexOf(' of'))]);
	const pieces: [number, number][] = [];
	clearOfOldWords(set, state).between(0, doc.length, (from, to) => void pieces.push([from, to]));
	expect(pieces).toEqual([
		[0, cut],
		[cut, doc.indexOf(' of')]
	]);
});

it('draws a flag across two people’s old words at one spot in two pieces', () => {
	const doc = 'an exampel of it';
	let state = EditorState.create({ doc, extensions: [cmSuggestions()] });
	const cut = doc.indexOf('pel');
	state = state.update({
		effects: setSuggestionRanges.of([
			{ id: 'a', from: cut, to: cut, restore: 'x', mine: false },
			{ id: 'b', from: cut, to: cut, restore: 'y', mine: true }
		])
	}).state;
	const word = doc.indexOf('exampel');
	const set = Decoration.set([Decoration.mark({ class: 'proofread-spelling' }).range(word, word + 7)]);
	const pieces: [number, number][] = [];
	clearOfOldWords(set, state).between(0, doc.length, (from, to) => void pieces.push([from, to]));
	expect(pieces).toEqual([
		[word, cut],
		[cut, word + 7]
	]);
});

it('puts what is typed in front of old words when the arrow key put the caret there', () => {
	editMode.current = 'suggesting';
	const doc = 'driven by an estimator of the error';
	const at = doc.indexOf('estimator');
	const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [cmSuggestions()] }) });
	view.dispatch({
		effects: setSuggestionRanges.of([{ id: 'r', from: at, to: at + 'estimator'.length, restore: 'indicator', mine: true }]),
		selection: { anchor: at }
	});
	takeTypedSides();
	const type = (text: string) => {
		const head = view.state.selection.main.head;
		view.dispatch({ changes: { from: head, insert: text }, selection: { anchor: head + text.length } });
	};

	view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
	expect(view.state.selection.main.head).toBe(at);
	type('an ');
	type('error ');
	expect(liveSuggestionRanges(view.state).map((r) => view.state.sliceDoc(r.from, r.to))).toEqual(['estimator']);
	expect(view.state.sliceDoc(0, view.state.doc.length)).toBe('driven by an an error estimator of the error');
	expect(takeTypedSides()).toEqual({ r: 'before' });
	view.destroy();
});

it('puts what is typed in front of old words a delete has just struck out', () => {
	editMode.current = 'suggesting';
	const doc = 'driven by an estimator of the error';
	const at = doc.indexOf('estimator');
	const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [cmSuggestions()] }) });
	view.dispatch({
		effects: setSuggestionRanges.of([{ id: 'r', from: at, to: at, restore: 'adaptive ', mine: true }]),
		selection: { anchor: at }
	});
	takeTypedSides();
	view.dispatch({ changes: { from: at - 1, to: at }, selection: { anchor: at - 1 }, userEvent: 'delete.backward' });
	const head = view.state.selection.main.head;
	view.dispatch({ changes: { from: head, insert: 'x' }, selection: { anchor: head + 1 }, userEvent: 'input.type' });
	expect(takeTypedSides()).toEqual({ r: 'before' });
	view.destroy();
});
