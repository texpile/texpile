import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { indentAtCaret } from '$lib/editor/source/extensions/keybindings/cmTabKey';

/** Tab on `doc` with `selection`, through a stand-in view that only holds a state */
function pressTab(doc: string, selection: EditorSelection): EditorState {
	const view = { state: EditorState.create({ doc, selection }) } as { state: EditorState; dispatch?: unknown };
	view.dispatch = (tr: { state: EditorState }) => (view.state = tr.state);
	indentAtCaret(view as unknown as EditorView);
	return view.state;
}

describe('Tab in a CodeMirror editor', () => {
	it('indents at the caret, not at the start of the line', () => {
		const state = pressTab('see \\cite{a}', EditorSelection.single(4));
		expect(state.doc.toString()).toBe('see   \\cite{a}');
		expect(state.selection.main.head).toBe(6);
	});

	it('still indents the lines of a selection', () => {
		const state = pressTab('one\ntwo', EditorSelection.single(0, 7));
		expect(state.doc.toString()).toBe('  one\n  two');
	});
});
