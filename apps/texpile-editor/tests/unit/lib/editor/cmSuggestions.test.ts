// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { history, undo } from '@codemirror/commands';
import { clearOfOldWords, cmSuggestions, liveSuggestionRanges, setSuggestionRanges } from '$lib/editor/source/cmSuggestions';
import { editMode, takeEditedPlaces, takeTypedSides } from '$lib/comments/activeSuggestions.svelte';

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

it('takes back an undone delete as the words it took, not as typing in front of them', () => {
	editMode.current = 'suggesting';
	const doc = 'the fox jumps over the dog';
	const at = doc.indexOf(' over');
	const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [history(), cmSuggestions()] }) });
	view.dispatch({ selection: { anchor: at } });
	const del = () => view.dispatch({ changes: { from: at, to: at + 1 }, userEvent: 'delete.forward' });
	del();
	del();
	// what the comparison makes of it: " over" now reads "ver"
	view.dispatch({ effects: setSuggestionRanges.of([{ id: 'r', from: at, to: at + 3, restore: ' over', mine: true }]) });
	takeTypedSides();
	undo(view);
	expect(takeTypedSides()).toEqual({});
	expect(liveSuggestionRanges(view.state).map((r) => view.state.sliceDoc(r.from, r.to))).toEqual([' over']);
	view.destroy();
});

it('reports where an edit landed, in each place several cursors changed, and not a collaborator’s edit', () => {
	const doc = 'The colour map.\nA colour bar.';
	const view = new EditorView({ parent: document.body, state: EditorState.create({ doc, extensions: [cmSuggestions()] }) });
	takeEditedPlaces();
	const colour = [...doc.matchAll(/colour/g)].map((m) => ({ from: m.index!, to: m.index! + 6, insert: 'color' }));
	view.dispatch({ changes: colour, userEvent: 'input.replace.all' });
	expect(takeEditedPlaces()?.changes).toEqual([
		{ fromA: 4, toA: 10, fromB: 4, toB: 9 },
		{ fromA: 18, toA: 24, fromB: 17, toB: 22 }
	]);
	view.dispatch({
		changes: [...view.state.doc.toString().matchAll(/color/g)].map((m) => ({ from: m.index!, to: m.index! + 5, insert: 'hue' }))
	});
	expect(takeEditedPlaces()).toBeNull();
	view.dispatch({ changes: { from: 0, insert: 'So ' }, userEvent: 'input.paste' });
	expect(takeEditedPlaces()?.changes).toEqual([{ fromA: 0, toA: 0, fromB: 0, toB: 3 }]);
	// a replacement is read off the text, which keeps a wrapper round a long passage one gesture
	view.dispatch({ changes: { from: 0, to: 2, insert: 'Thus' }, userEvent: 'input.type' });
	expect(takeEditedPlaces()).toBeNull();
	view.destroy();
});
