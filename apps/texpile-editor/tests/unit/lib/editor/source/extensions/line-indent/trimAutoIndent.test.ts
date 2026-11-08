import { describe, expect, it } from 'vitest';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { trimAutoIndent } from '$lib/editor/source/extensions/line-indent/trimAutoIndent';

/** a stand-in view that only holds a state, with Enter pressed at `at` */
function enterAt(doc: string, at: number): { state: EditorState } {
	const start = EditorState.create({ doc, selection: EditorSelection.single(at), extensions: [latex(), trimAutoIndent()] });
	const view = { state: start } as { state: EditorState; dispatch?: unknown };
	view.dispatch = (tr: { state: EditorState }) => (view.state = tr.state);
	insertNewlineAndIndent(view as unknown as EditorView);
	return view;
}

describe('the indent Enter adds', () => {
	const doc = '\\begin{itemize}\n  \\item a\n\\end{itemize}';
	const at = doc.indexOf('\n\\end');

	it('goes when the caret leaves the line untyped', () => {
		const view = enterAt(doc, at);
		expect(view.state.doc.line(3).text).toBe('  ');
		const left = view.state.update({ selection: EditorSelection.single(0) }).state;
		expect(left.doc.toString()).toBe('\\begin{itemize}\n  \\item a\n\n\\end{itemize}');
	});

	it('stays once something is typed on the line', () => {
		const view = enterAt(doc, at);
		const head = view.state.selection.main.head;
		const typed = view.state.update({
			changes: { from: head, insert: 'x' },
			selection: { anchor: head + 1 },
			userEvent: 'input.type'
		}).state;
		const left = typed.update({ selection: EditorSelection.single(0) }).state;
		expect(left.doc.line(3).text).toBe('  x');
	});
});
