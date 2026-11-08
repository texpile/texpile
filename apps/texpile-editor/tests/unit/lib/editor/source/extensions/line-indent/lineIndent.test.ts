import { describe, expect, it } from 'vitest';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { getIndentation } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { latex } from '$lib/languages/latex/source/latexLanguage';

/** Enter at the `|` in `doc`, through a stand-in view that only holds a state */
function pressEnter(doc: string): string {
	const at = doc.indexOf('|');
	const start = EditorState.create({ doc: doc.replace('|', ''), selection: EditorSelection.single(at), extensions: latex() });
	const view = { state: start } as { state: EditorState; dispatch?: unknown };
	view.dispatch = (tr: { state: EditorState }) => (view.state = tr.state);
	insertNewlineAndIndent(view as unknown as EditorView);
	const { state } = view;
	const head = state.selection.main.head;
	return state.sliceDoc(0, head) + '|' + state.sliceDoc(head);
}

describe('Enter in the LaTeX source', () => {
	it('keeps the indent of the line inside an environment', () => {
		expect(pressEnter('\\begin{figure}\n  \\centering|\n\\end{figure}')).toBe('\\begin{figure}\n  \\centering\n  |\n\\end{figure}');
	});

	it('indents one level after an opening bracket or a \\begin', () => {
		expect(pressEnter('\\begin{itemize}|')).toBe('\\begin{itemize}\n  |');
		expect(pressEnter('  \\newcommand{\\foo}{%|')).toBe('  \\newcommand{\\foo}{%\n    |');
		expect(pressEnter('\\begin{document}|')).toBe('\\begin{document}\n|');
	});

	it('drops a level for a line that starts with a closing bracket or \\end', () => {
		const state = EditorState.create({ doc: '\\begin{align}\n  a\n  \\end{align}\n\\foo{\n  b\n  }', extensions: latex() });
		expect(getIndentation(state, state.doc.line(3).from)).toBe(0);
		expect(getIndentation(state, state.doc.line(6).from)).toBe(0);
	});
});
