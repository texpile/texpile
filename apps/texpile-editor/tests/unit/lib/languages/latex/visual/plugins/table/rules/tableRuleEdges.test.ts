import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { cellEdgesOf, columnsOf, horizontalRule } from '$lib/languages/latex/visual/plugins/table/rules/tableRuleEdges';

function tableOf(body: string): Node {
	let table: Node | null = null;
	treeToProseMirror(body).doc.descendants((node) => {
		if (!table && node.type.name === 'table') table = node;
		return !table;
	});
	return table!;
}

describe('the rules a LaTeX table prints', () => {
	it('reads the rule between two rows by weight and by the columns it crosses', () => {
		expect(horizontalRule('\\toprule', 2)).toEqual(['heavy', 'heavy']);
		expect(horizontalRule('\\hline \\hline', 2)).toEqual(['double', 'double']);
		expect(horizontalRule('\\cmidrule(lr){2-3}\\addlinespace', 3)).toEqual([null, 'light', 'light']);
		expect(horizontalRule('\\rowcolor{gray}', 2)).toEqual([null, null]);
	});

	it('reads the bars and letters of a column spec past what stands between the columns', () => {
		expect(columnsOf('|l|c|', 2)).toEqual({ bars: [true, true, true], letters: ['l', 'c'] });
		expect(columnsOf('@{}l>{\\bfseries}r|p{3cm}@{}', 3)).toEqual({ bars: [false, false, true, false], letters: ['l', 'r', 'p'] });
		expect(columnsOf('l|*{2}{c}|', 3)?.bars).toEqual([false, true, false, true]);
		expect(columnsOf('lS[table-format=2.1]', 2)?.letters).toEqual(['l', 'S']);
		expect(columnsOf('lll', 2)).toBeNull();
	});

	it('gives a booktabs table three rules and no bars, and a table the editor made every rule', () => {
		const booktabs = tableOf(
			'\\begin{tabular}{lr}\n\\toprule\nModel & Dev \\\\\n\\midrule\nOurs & 78.4 \\\\\n\\bottomrule\n\\end{tabular}\n'
		);
		expect([...cellEdgesOf(booktabs).values()]).toEqual([
			{ top: 'heavy', bottom: 'light', left: false, right: false, align: 'left' },
			{ top: 'heavy', bottom: 'light', left: false, right: false, align: 'right' },
			{ top: 'light', bottom: 'heavy', left: false, right: false, align: 'left' },
			{ top: 'light', bottom: 'heavy', left: false, right: false, align: 'right' }
		]);
		const made = booktabs.type.create({ ...booktabs.attrs, env: null, colspec: null }, booktabs.content);
		expect(new Set([...cellEdgesOf(made).values()].map((e) => JSON.stringify(e)))).toEqual(
			new Set([JSON.stringify({ top: 'light', bottom: 'light', left: true, right: true, align: 'center' })])
		);
	});
});
