import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';
import { withBars, withLatexLines, withoutRules } from '$lib/languages/latex/visual/plugins/table/rules/latexTableLines';
import { latexTableLook } from '$lib/languages/latex/visual/plugins/table/rules/latexTableLook';
import type { TableLines } from '$lib/editor/visual/extensions/table/rules/tableRules';

const file = (table: string) => `\\documentclass{article}\n\\begin{document}\n${table}\n\\end{document}\n`;

function tableAt(doc: Node): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.type.name === 'table') at = pos;
		return at < 0;
	});
	return at;
}

function withLines(source: string, lines: TableLines): { out: string; read: TableLines | null } {
	const parsed = parseLatexFile(source);
	const state = EditorState.create({ doc: parsed.doc });
	const at = tableAt(state.doc);
	const edited = withLatexLines(state.tr, at, lines).doc;
	return { out: serializeLatexFile(parsed, edited), read: latexTableLook.linesOf(edited.nodeAt(at)!) };
}

describe('the Lines choice of a LaTeX table', () => {
	it('sets the bars of a column spec around what stands between its columns', () => {
		expect(withBars('@{}l>{\\bfseries}r|p{3cm}@{}', true)).toBe('@{}|l|>{\\bfseries}r|p{3cm}@{}|');
		expect(withBars('|l|*{2}{c|}', false)).toBe('lcc');
		expect(withBars('|c|', true, false)).toBe('c|');
		expect(withoutRules('\\hline\\rowcolor{gray}\n\\cmidrule(lr){2-3}\\toprule[1pt]')).toBe('\\rowcolor{gray}');
	});

	it('writes the rules of the choice and reads the same choice back', () => {
		const ruled = file(
			'\\begin{tabular}{|l|c|}\n\\hline\nName & Count \\\\\n\\hline\nApples & \\multicolumn{1}{|r|}{3} \\\\\n\\hline\nPears & 4 \\\\\n\\hline\n\\end{tabular}'
		);
		expect(latexTableLook.linesOf(parseLatexFile(ruled).doc.nodeAt(tableAt(parseLatexFile(ruled).doc))!)).toBe('all');

		const formal = withLines(ruled, 'formal');
		expect(formal.read).toBe('formal');
		expect(formal.out).toContain(
			'\\begin{tabular}{lc}\n\\toprule\nName & Count \\\\\n\\midrule\nApples & \\multicolumn{1}{r}{3} \\\\\nPears & 4 \\\\\n\\bottomrule\n\\end{tabular}'
		);

		const all = withLines(formal.out, 'all');
		expect(all.read).toBe('all');
		expect(all.out).toContain(
			'\\begin{tabular}{|l|c|}\n\\hline\nName & Count \\\\\n\\hline\nApples & \\multicolumn{1}{r|}{3} \\\\\n\\hline'
		);

		const none = withLines(ruled, 'none');
		expect(none.read).toBe('none');
		expect(none.out).not.toMatch(/\\hline|\|/);
	});
});
