// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { addColumnAfter } from 'prosemirror-tables';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const src =
	'\\documentclass{article}\n\\begin{document}\n\\begin{tabular}{|l|c|r|}\n\\hline\nName & Count & Share \\\\\n\\hline\nApples & 3 & 30\\% \\\\\n\\end{tabular}\n\\end{document}\n';

describe('a column added to a parsed table', () => {
	it('reaches the file, its new cells empty', () => {
		const parsed = parseLatexFile(src);
		let at = -1;
		parsed.doc.descendants((n, pos) => {
			if (at < 0 && n.type.name === 'table_cell' && n.textContent === 'Count') at = pos + 2;
			return at < 0;
		});
		let state = EditorState.create({ doc: parsed.doc, selection: TextSelection.create(parsed.doc, at) });
		addColumnAfter(state, (tr) => (state = state.apply(tr)));
		const out = serializeLatexFile(parsed, state.doc);
		expect(out).toContain('Name & Count &  & Share \\\\');
		expect(out).toContain('Apples & 3 &  & 30\\% \\\\');
	});
});
