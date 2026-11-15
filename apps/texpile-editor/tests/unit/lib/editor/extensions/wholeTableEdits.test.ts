// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import { wholeTableEdits } from '$lib/editor/visual/extensions/table/wholeTableEdits';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';

const BASICS = readFileSync(`${__dirname}/../../../../fixtures/comments/basics.tex`, 'utf8');
const FIGURE = `The table below lists the runs.

#figure(
  table(
    columns: 2,
    [Run], [Time],
    [A], [1.2],
  ),
  caption: [Timing for each run],
)

A closing paragraph after it.
`;

function textAt(doc: PMNode, words: string, offset = 0): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text!.includes(words)) at = pos + node.text!.indexOf(words) + offset;
		return at < 0;
	});
	return at;
}

function mount(doc: PMNode, from: number, to: number): EditorView {
	const state = EditorState.create({ doc, plugins: [wholeTableEdits] });
	const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)));
	return view;
}

function press(view: EditorView, key: string): boolean {
	return view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key }))) ?? false;
}

const tables = (doc: PMNode) => {
	let n = 0;
	doc.descendants((node) => void (node.type.spec.tableRole === 'table' && n++));
	return n;
};

describe('an edit across a table edge', () => {
	it('deletes the whole table when a selection runs from a list item into a cell', () => {
		const doc = parseLatexFile(BASICS).doc;
		const view = mount(doc, textAt(doc, 'Tab indents', 3), textAt(doc, 'Visual mode', 3));
		expect(press(view, 'Backspace')).toBe(true);
		expect(tables(view.state.doc)).toBe(0);
		expect(view.state.doc.textContent).toContain('Tab');
		expect(view.state.doc.textContent).not.toContain('Tab indents');
		view.destroy();
	});

	it('deletes the whole table from the paragraph before it into its caption, leaving no empty grid', () => {
		const doc = parseTypstFile(FIGURE).doc;
		const view = mount(doc, textAt(doc, 'lists the runs', 0), textAt(doc, 'Timing', 3));
		expect(press(view, 'Delete')).toBe(true);
		expect(tables(view.state.doc)).toBe(0);
		expect(view.state.doc.textContent).toContain('The table below ');
		expect(view.state.doc.textContent).not.toContain('Timing');
		view.destroy();
	});

	it('deletes the whole table from its caption into one of its own cells', () => {
		const doc = parseLatexFile(BASICS).doc;
		const view = mount(doc, textAt(doc, 'Click directly', 3), textAt(doc, 'Autocomplete', 3));
		expect(press(view, 'Backspace')).toBe(true);
		expect(tables(view.state.doc)).toBe(0);
		expect(view.state.doc.textContent).not.toContain('Click directly');
		view.destroy();
	});

	it('types over the whole table', () => {
		const doc = parseTypstFile(FIGURE).doc;
		const view = mount(doc, textAt(doc, 'lists the runs', 0), textAt(doc, 'Time', 2));
		const { from, to } = view.state.selection;
		expect(view.someProp('handleTextInput', (f) => f(view, from, to, 'X', () => view.state.tr))).toBe(true);
		expect(tables(view.state.doc)).toBe(0);
		expect(view.state.doc.textContent).toContain('The table below X');
		view.destroy();
	});

	it('leaves a selection that stays on one side of every table edge to the editor', () => {
		const doc = parseTypstFile(FIGURE).doc;
		const inCell = mount(doc, textAt(doc, 'Time', 1), textAt(doc, 'Time', 3));
		expect(press(inCell, 'Backspace')).toBe(false);
		const around = mount(doc, textAt(doc, 'The table', 2), textAt(doc, 'A closing', 2));
		expect(press(around, 'Backspace')).toBe(false);
		inCell.destroy();
		around.destroy();
	});
});

describe('an edit that reaches a caption and no cell', () => {
	it('types over the end of the paragraph and the start of the caption, keeping every row', () => {
		const doc = parseLatexFile(
			'\\documentclass{article}\n\\begin{document}\n\nParagraph before.\n\n\\begin{table}\n\\caption{Cap table}\n\\begin{tabular}{ll}\none & 1\n\\end{tabular}\n\\end{table}\n\n\\end{document}\n'
		).doc;
		const view = mount(doc, textAt(doc, 'before.', 6), textAt(doc, 'Cap', 2));
		const { from, to } = view.state.selection;
		expect(view.someProp('handleTextInput', (f) => f(view, from, to, 'Q', () => view.state.tr)) ?? false).toBe(false);
		expect(press(view, 'Backspace')).toBe(false);
		view.destroy();
	});
});
