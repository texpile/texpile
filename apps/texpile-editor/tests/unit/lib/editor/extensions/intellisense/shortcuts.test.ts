import { describe, it, expect } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { computeToggleWrap, computeWrapBlock, computeLink } from '../../../../../../src/lib/languages/latex/intellisense/shortcuts';

function apply(doc: string, anchor: number, head: number, fn: (state: EditorState) => ReturnType<typeof computeToggleWrap>) {
	const state = EditorState.create({ doc, selection: { anchor, head } });
	const spec = fn(state);
	return state.update(spec).state;
}

describe('toggle-wrap keyboard shortcuts', () => {
	it('wraps a selection in \\textbf{...}', () => {
		const doc = 'hello world';
		const next = apply(doc, 0, 5, (s) => computeToggleWrap(s, 'textbf'));
		expect(next.doc.toString()).toBe('\\textbf{hello} world');
	});

	it('unwraps when the selection already IS \\textbf{...}', () => {
		const doc = '\\textbf{hello} world';
		const next = apply(doc, 0, '\\textbf{hello}'.length, (s) => computeToggleWrap(s, 'textbf'));
		expect(next.doc.toString()).toBe('hello world');
	});

	it('with no selection, inserts an empty \\textbf{} and places the cursor between the braces', () => {
		const doc = 'hello ';
		const state = EditorState.create({ doc, selection: { anchor: 6 } });
		const spec = computeToggleWrap(state, 'textbf');
		const next = state.update(spec).state;
		expect(next.doc.toString()).toBe('hello \\textbf{}');
		expect(next.selection.main.head).toBe('hello \\textbf{'.length);
	});

	it('wraps each of several selections', () => {
		const state = EditorState.create({
			doc: 'Speed is and now',
			extensions: EditorState.allowMultipleSelections.of(true),
			selection: EditorSelection.create([EditorSelection.range(0, 5), EditorSelection.range(9, 12)])
		});
		expect(state.update(computeToggleWrap(state, 'textbf')).state.doc.toString()).toBe('\\textbf{Speed} is \\textbf{and} now');
	});

	it('with an empty selection already inside \\textbf{...}, unwraps in place', () => {
		const doc = '\\textbf{hello}';
		const cursorInside = '\\textbf{hel'.length;
		const state = EditorState.create({ doc, selection: { anchor: cursorInside } });
		const spec = computeToggleWrap(state, 'textbf');
		const next = state.update(spec).state;
		expect(next.doc.toString()).toBe('hello');
	});

	it('wraps a selection for a block-level shortcut (one-way, no toggle-off)', () => {
		const doc = 'quoted text';
		const next = apply(doc, 0, doc.length, (s) => computeWrapBlock(s, '\\begin{quote}\n', '\n\\end{quote}'));
		expect(next.doc.toString()).toBe('\\begin{quote}\nquoted text\n\\end{quote}');
	});
});

describe('computeLink', () => {
	it('a selection becomes the label, with the URL placeholder selected for typing over', () => {
		const state = EditorState.create({ doc: 'click me', selection: { anchor: 0, head: 5 } });
		const next = state.update(computeLink(state)).state;
		expect(next.doc.toString()).toBe('\\href{https://}{click} me');
		expect(next.doc.sliceString(next.selection.main.from, next.selection.main.to)).toBe('https://');
	});

	it('an empty cursor inserts the full skeleton with a placeholder label', () => {
		const state = EditorState.create({ doc: '', selection: { anchor: 0 } });
		const next = state.update(computeLink(state)).state;
		expect(next.doc.toString()).toBe('\\href{https://}{text}');
		expect(next.doc.sliceString(next.selection.main.from, next.selection.main.to)).toBe('https://');
	});
});
