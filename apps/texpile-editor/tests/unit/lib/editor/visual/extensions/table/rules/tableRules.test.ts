import { EditorState } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { tableRulesPlugin, type TableRuleSpec } from '$lib/editor/visual/extensions/table/rules/tableRules';
import { latexTableLook } from '$lib/languages/latex/visual/plugins/table/rules/latexTableLook';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const TABULAR = '\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}';

function sidesOf(body: string): (string | undefined)[] {
	const { doc } = parseLatexFile(`\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`);
	const plugin = tableRulesPlugin(latexTableLook);
	const state = EditorState.create({ doc, plugins: [plugin] });
	const set = plugin.getState(state) as DecorationSet;
	const sides: (string | undefined)[] = [];
	doc.descendants((node, pos) => {
		if (node.type.name !== 'table') return true;
		const spec = set.find(pos, pos + node.nodeSize).find((d) => d.from === pos && d.to === pos + node.nodeSize)?.spec as TableRuleSpec;
		sides.push(spec?.side);
		return false;
	});
	return sides;
}

describe('tableRulesPlugin', () => {
	it('stands a tabular where the DOM editor did: at the left alone, centered in center and a float, right in flushright', () => {
		const body = [
			TABULAR,
			`\\begin{center}\n${TABULAR}\n\\end{center}`,
			`\\begin{flushright}\n${TABULAR}\n\\end{flushright}`,
			`\\begin{table}\n\\centering\n${TABULAR}\n\\caption{C}\n\\end{table}`
		].join('\n\n');
		expect(sidesOf(body)).toEqual(['left', 'center', 'right', 'center']);
	});
});
