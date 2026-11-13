// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { tabThroughCells } from '$lib/editor/visual/extensions/table/rows/addTableRow';
import { tableRulesPlugin } from '$lib/editor/visual/extensions/table/rules/tableRules';
import { latexTableLook } from '$lib/languages/latex/visual/plugins/table/rules/latexTableLook';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

const SRC = `\\documentclass{article}
\\begin{document}
\\begin{tabular}{|l|l|}
\\hline
a & b \\\\
\\hline
c & d \\\\
\\hline
\\end{tabular}
\\end{document}
`;

function endOf(doc: Node, word: string): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text === word) at = pos + word.length;
	});
	return at;
}

// Tab stopped in the last cell, and a row added to a table with every line had no line over it
it('adds a row from the last cell, in the lines the table has, and goes into it', () => {
	const parsed = parseLatexFile(SRC);
	const state = EditorState.create({ doc: parsed.doc, plugins: [tableRulesPlugin(latexTableLook)] });
	const view = new EditorView(document.body.appendChild(document.createElement('div')), { state });
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, endOf(view.state.doc, 'd'))));
	expect(tabThroughCells(view.state, view.dispatch, view)).toBe(true);
	view.dispatch(view.state.tr.insertText('e'));
	expect(serializeLatexFile(parsed, view.state.doc)).toContain('c & d \\\\\n\\hline\ne & \\\\\n\\hline\n\\end{tabular}');
	view.destroy();
});
