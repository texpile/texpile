// a table's bytes around its cells (the colspec, a row's & between cells) hold while its columns and each row's spans stay as parsed
import type { Node } from 'prosemirror-model';
import { TableMap } from 'prosemirror-tables';

function spansOf(row: Node): string {
	const spans: string[] = [];
	row.forEach((cell) => spans.push(`${cell.attrs.colspan ?? 1}x${cell.attrs.rowspan ?? 1}`));
	return spans.join(',');
}

export function tableFrameHolds(node: Node, parsed: Node): boolean {
	if (node.type.name === 'table') return TableMap.get(node).width === TableMap.get(parsed).width;
	if (node.type.name === 'table_row') return spansOf(node) === spansOf(parsed);
	return true;
}
