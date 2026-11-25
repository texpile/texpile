// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { islandKeysPlugin } from '$lib/editor/canvas/islands/islandKeys';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { createTestCanvasView } from '../testing/testCanvasView';

function rawBlock(text: string, caret: number): EditorView {
	const doc = schema.nodes.doc.create(null, [schema.nodes.raw_latex.create(null, schema.text(text))]);
	const state = EditorState.create({ doc, plugins: [islandKeysPlugin()] });
	const view = createTestCanvasView(state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1 + caret))));
	return view as unknown as EditorView;
}

function press(view: EditorView, init: KeyboardEventInit): boolean {
	const event = new KeyboardEvent('keydown', init);
	return !!view.someProp('handleKeyDown', (handle) => handle(view, event));
}

it('a raw block takes the source editor line keys: comment, indent and move a line', () => {
	const view = rawBlock('\\begin{a}\nbody\n\\end{a}', 12);
	expect(press(view, { key: '/', ctrlKey: true })).toBe(true);
	expect(view.state.doc.textContent).toBe('\\begin{a}\n% body\n\\end{a}');
	expect(press(view, { key: 'ArrowUp', altKey: true })).toBe(true);
	expect(view.state.doc.textContent).toBe('% body\n\\begin{a}\n\\end{a}');
	expect(press(view, { key: 'Tab' })).toBe(true);
	expect(view.state.doc.textContent.startsWith('% ')).toBe(true);
	expect(view.state.doc.textContent.split('\n')[0].length).toBeGreaterThan('% body'.length);
});

it('Enter leaves an inline chip for the text after it, as its CodeMirror did', () => {
	const doc = schema.nodes.doc.create(null, [
		schema.nodes.paragraph.create(null, [schema.nodes.inline_latex.create(null, schema.text('\\foo')), schema.text(' after')])
	]);
	const state = EditorState.create({ doc, plugins: [islandKeysPlugin()] });
	const view = createTestCanvasView(state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)))) as unknown as EditorView;
	expect(press(view, { key: 'Enter' })).toBe(true);
	expect(view.state.doc.childCount).toBe(1);
	expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
	expect(view.state.doc.textBetween(view.state.selection.from, view.state.doc.content.size - 1)).toBe(' after');
});

it('Backspace in an emptied raw block removes the block', () => {
	const doc = schema.nodes.doc.create(null, [
		schema.nodes.paragraph.create(null, schema.text('before')),
		schema.nodes.raw_latex.create(null, schema.text('  '))
	]);
	const state = EditorState.create({ doc, plugins: [islandKeysPlugin()] });
	const view = createTestCanvasView(state.apply(state.tr.setSelection(TextSelection.create(state.doc, 10)))) as unknown as EditorView;
	expect(press(view, { key: 'Backspace' })).toBe(true);
	expect(view.state.doc.childCount).toBe(1);
	expect(view.state.doc.textContent).toBe('before');
});

it('Ctrl+Enter leaves a raw block for a paragraph below it', () => {
	const view = rawBlock('\\foo', 2);
	expect(press(view, { key: 'Enter', ctrlKey: true })).toBe(true);
	expect(view.state.doc.lastChild?.type.name).toBe('paragraph');
	expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
});

it('Shift+Mod+K deletes the line the caret is on and keeps its column on the next', () => {
	const view = rawBlock('one\ntwo\nthree', 5);
	expect(press(view, { key: 'K', keyCode: 75, ctrlKey: true, shiftKey: true })).toBe(true);
	expect(view.state.doc.textContent).toBe('one\nthree');
	expect(view.state.selection.from).toBe(1 + 'one\nt'.length);
});
