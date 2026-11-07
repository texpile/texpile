// the rules and row ends between table rows, and the cells a \multirow covers
import type { PmNode, TreeImport } from '$lib/languages/latex/visual/core/document';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';

export function isTableRule(name: string): boolean {
	return commonFacts(name).betweenRows === true;
}

export function isRowEnd(name: string): boolean {
	return commonFacts(name).endsRow === true;
}

// a rule with arguments (\rowcolor, \cdashline) is left to the arity guess when no package gives its signature
export function isTableRuleWithoutArguments(name: string): boolean {
	return isTableRule(name) && commonCommand(name)?.args.length === 0;
}

// drop the placeholder cells LaTeX writes under a \multirow: prosemirror-tables omits covered cells
export function resolveSpans(im: TreeImport, rows: PmNode[]): PmNode[] {
	const covered: boolean[][] = [];
	function mark(r: number, c: number) {
		while (covered.length <= r) covered.push([]);
		covered[r][c] = true;
	}
	return rows.map((row, r) => {
		const kept: PmNode[] = [];
		let col = 0;
		row.forEach((cell) => {
			const cs = Number(cell.attrs.colspan ?? 1);
			const rs = Number(cell.attrs.rowspan ?? 1);
			if (covered[r]?.[col]) {
				col += cs; // a placeholder for a rowspan from above: drop it
				return;
			}
			kept.push(cell);
			if (rs > 1) for (let rr = r + 1; rr < r + rs; rr++) for (let cc = col; cc < col + cs; cc++) mark(rr, cc);
			col += cs;
		});
		return im.core.node(
			'table_row',
			row.attrs,
			kept.length
				? kept
				: [im.core.node('table_cell', { colspan: 1, rowspan: 1, colwidth: null, mcAlign: null }, [im.core.node('paragraph')])]
		);
	});
}
