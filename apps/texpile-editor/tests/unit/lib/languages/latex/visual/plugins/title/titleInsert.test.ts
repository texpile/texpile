import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { titleInserts } from '$lib/languages/latex/visual/plugins/title/titleInsert';
import type { LatexInsertContext } from '$lib/languages/latex/visual/core';

function turned(body: string): string {
	const doc = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`).doc;
	const ctx = { command: () => ({}) } as unknown as LatexInsertContext;
	const title = titleInserts(ctx).find((o) => o.id === 'title');
	if (!title || title.shape !== 'block' || !title.turn) throw new Error('no title style');
	let state = EditorState.create({ doc });
	state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
	title.turn(state, (tr) => void (state = state.apply(tr)));
	return serializeToLatex(state.doc).trim();
}

describe('turning a paragraph into the title', () => {
	it('keeps its math, citations and commands as LaTeX', () => {
		expect(turned('A $x^2$ and \\cite{k} and \\textbf{b} \\& more')).toBe('\\title{A $x^2$ and \\cite{k} and \\textbf{b} \\& more}');
	});

	it('closes its brace on a line of its own after a comment', () => {
		expect(turned('Words % note')).toBe('\\title{Words % note\n}');
	});
});
