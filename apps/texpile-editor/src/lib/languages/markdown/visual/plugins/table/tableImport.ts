// GFM pipe tables
import type { SyntaxNode } from '@lezer/common';
import { childrenOf, LineState, type PmNode, type Reader } from '$lib/languages/markdown/visual/core';

/** an alignment as the delimiter row writes it: `:---`, `---:`, `:--:` or `---` */
function alignmentOf(cell: string): string {
	const left = cell.startsWith(':');
	const right = cell.endsWith(':');
	if (left && right) return ':--:';
	return left ? ':---' : right ? '---:' : '---';
}

/** a row's cells, an empty one being a gap between pipes that holds no node */
function cellsOf(row: SyntaxNode): (SyntaxNode | null)[] {
	const cells: (SyntaxNode | null)[] = [];
	let pending: SyntaxNode | null = null;
	const kids = childrenOf(row);
	for (let i = 0; i < kids.length; i++) {
		if (kids[i].name === 'TableCell') pending = kids[i];
		else if (kids[i].name === 'TableDelimiter') {
			if (pending || i > 0) cells.push(pending);
			pending = null;
		}
	}
	if (pending) cells.push(pending);
	return cells;
}

function rowNode(outer: Reader, row: SyntaxNode, width: number, type: 'table_header' | 'table_cell'): PmNode {
	const r: Reader = { ...outer, inCell: true };
	const cells = cellsOf(row);
	const out: PmNode[] = [];
	for (let i = 0; i < width; i++) {
		const cell = cells[i];
		const content = cell ? r.inline(r, childrenOf(cell), cell.from, cell.to, [], new LineState()) : [];
		out.push(r.node(type, null, [r.node('paragraph', null, content)]));
	}
	return r.node('table_row', { topRules: '' }, out);
}

export function readTable(r: Reader, node: SyntaxNode): PmNode[] {
	const kids = childrenOf(node);
	const header = kids.find((k) => k.name === 'TableHeader')!;
	const delimiter = kids.find((k) => k.name === 'TableDelimiter');
	const width = cellsOf(header).length;
	const written = delimiter ? r.src.text.slice(delimiter.from, delimiter.to).trim().replace(/^\|/, '').replace(/\|$/, '').split('|') : [];
	const aligns: string[] = [];
	for (let i = 0; i < width; i++) aligns.push(alignmentOf((written[i] ?? '').trim()));
	const rows = [rowNode(r, header, width, 'table_header')];
	for (const row of kids.filter((k) => k.name === 'TableRow')) rows.push(rowNode(r, row, width, 'table_cell'));
	// the delimiter row is not a node: it is rebuilt from the alignment so a regenerated table keeps it
	return [r.node('table', { env: null, colspec: aligns.join('|') || null }, rows)];
}
