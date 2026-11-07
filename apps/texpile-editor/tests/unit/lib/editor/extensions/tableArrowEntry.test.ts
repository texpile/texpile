// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { tableArrowEntry } from '$lib/editor/visual/extensions/table/tableArrowEntry';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseTypstFile } from '$lib/languages/typst/visual/roundtrip';

function press(doc: EditorState['doc'], at: number, key: string) {
	let state = EditorState.create({ doc, selection: TextSelection.create(doc, at) });
	const view = {
		get state() {
			return state;
		},
		dispatch: (tr: Transaction) => (state = state.apply(tr))
	} as unknown as EditorView;
	tableArrowEntry.props.handleKeyDown!.call(tableArrowEntry, view, new KeyboardEvent('keydown', { key }));
	return state.selection.$head;
}
function edgeOf(doc: EditorState['doc'], needle: string, end: boolean): number {
	let at = -1;
	doc.descendants((n, pos) => {
		if (at < 0 && n.isTextblock && n.textContent.startsWith(needle)) at = pos + 1 + (end ? n.content.size : 0);
		return at < 0;
	});
	return at;
}

describe('an arrow from the block beside a table goes into its facing cell', () => {
	const docs = {
		latex: parseLatexFile(
			'\\documentclass{article}\n\\begin{document}\nBefore.\n\n\\begin{tabular}{ll}\na1 & b1 \\\\\na2 & b2\n\\end{tabular}\n\nAfter.\n\\end{document}\n'
		).doc,
		typst: parseTypstFile('Before.\n\n#table(columns: 2,\n  [a1], [b1],\n  [a2], [b2],\n)\n\nAfter.\n').doc
	};
	for (const [name, doc] of Object.entries(docs)) {
		it(`${name}: ArrowLeft at the start of the block after it lands at the end of the last cell`, () => {
			const $head = press(doc, edgeOf(doc, 'After', false), 'ArrowLeft');
			expect($head.parent.textContent).toBe('b2');
			expect($head.parentOffset).toBe(2);
		});
		it(`${name}: ArrowRight at the end of the block before it lands at the start of the first cell`, () => {
			const $head = press(doc, edgeOf(doc, 'Before', true), 'ArrowRight');
			expect($head.parent.textContent).toBe('a1');
			expect($head.parentOffset).toBe(0);
		});
	}
});
