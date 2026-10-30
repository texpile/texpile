// the rules between table rows, and the cells a \multirow covers
import { buildNode, type PmNode } from '../../../builders';
import { commonFacts } from '../../../../knowledge/commands/commandFacts';
import { commonCommand } from '../../../../knowledge/calls/commandCalls';

export function isTableRule(name: string): boolean {
	return commonFacts(name).betweenRows === true;
}

// a rule with arguments (\rowcolor, \cdashline) is left to the arity guess when no package gives its signature
export function isTableRuleWithoutArguments(name: string): boolean {
	return isTableRule(name) && commonCommand(name)?.args.length === 0;
}

// drop the placeholder cells LaTeX writes under a \multirow: prosemirror-tables omits covered cells
export function resolveSpans(rows: PmNode[]): PmNode[] {
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
		return buildNode(
			'table_row',
			{ topRules: row.attrs.topRules ?? '', rowBreakSuffix: row.attrs.rowBreakSuffix ?? '' },
			kept.length ? kept : [buildNode('table_cell', { colspan: 1, rowspan: 1, colwidth: null, mcAlign: null }, [buildNode('paragraph')])]
		);
	});
}
