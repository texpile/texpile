// @vitest-environment jsdom
// A split slot opens with the focused editor's caret as its own, so nothing has to place one when focus arrives
import { afterEach, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { carryCaret } from '../../../../../src/views/workspace/pane/splitCaret';

const SOURCE =
	'\\documentclass{article}\n\\begin{document}\n\\begin{enumerate}\n  \\item Alpha\n  \\item Beta\n\\end{enumerate}\n\n\\begin{equation}\n  a^2 + b^2 = c^2\n\\end{equation}\n\nLast paragraph.\n\\end{document}\n';

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

function editor(): EditorView {
	const { doc } = parseLatexFile(SOURCE);
	const view = new EditorView(document.body.appendChild(document.createElement('div')), { state: EditorState.create({ doc }) });
	views.push(view);
	return view;
}

function posOf(view: EditorView, test: (name: string, text: string) => boolean): number {
	let at = -1;
	view.state.doc.descendants((node, pos) => {
		if (at < 0 && test(node.type.name, node.textContent)) at = pos;
	});
	return at;
}

it('takes the caret of the editor it was split from, beside a selected formula', () => {
	const from = editor();
	const to = editor();
	const inText = posOf(from, (_, text) => text === 'Last paragraph.') + 5;
	from.dispatch(from.state.tr.setSelection(TextSelection.create(from.state.doc, inText)));
	carryCaret(from, to);
	expect(to.state.selection.toJSON()).toEqual(from.state.selection.toJSON());

	const formula = posOf(from, (name) => name === 'block_math');
	from.dispatch(from.state.tr.setSelection(NodeSelection.create(from.state.doc, formula)));
	carryCaret(from, to);
	expect(to.state.selection).toBeInstanceOf(TextSelection);
	expect(to.state.selection.from).toBeGreaterThan(formula);
	expect(to.hasFocus()).toBe(false);
});
