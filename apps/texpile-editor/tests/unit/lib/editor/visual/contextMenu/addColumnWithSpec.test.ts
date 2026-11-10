// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { addColumnWithSpec } from '$lib/editor/visual/contextMenu/addColumnWithSpec';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const src =
	'\\documentclass{article}\n\\begin{document}\n\\begin{tabular}{|l|c|r|}\n\\hline\nName & Count & Share \\\\\n\\end{tabular}\n\\end{document}\n';

function addColumn(side: 'before' | 'after', cellText: string): string {
	const parsed = parseLatexFile(src);
	let at = -1;
	parsed.doc.descendants((n, pos) => {
		if (at < 0 && n.type.name === 'table_cell' && n.textContent === cellText) at = pos + 2;
		return at < 0;
	});
	let state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, at) });
	addColumnWithSpec(side)(state, (tr) => (state = state.apply(tr)));
	return serializeLatexFile(parsed, state.doc);
}

describe('Add Column in a LaTeX table', () => {
	it('gives the colspec a copy of the column it was added beside', () => {
		expect(addColumn('after', 'Count')).toContain('\\begin{tabular}{|l|c|c|r|}');
		expect(addColumn('before', 'Name')).toContain('\\begin{tabular}{|l|l|c|r|}');
	});
});
