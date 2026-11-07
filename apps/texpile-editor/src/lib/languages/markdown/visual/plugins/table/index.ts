import type { Node } from 'prosemirror-model';
import type { MarkdownPlugin, MarkdownSaveCore } from '$lib/languages/markdown/visual/core';
import { readTable } from './tableImport';

function tableRows(node: Node, core: MarkdownSaveCore): { header: string[] | null; body: string[][]; cols: number } {
	const rows: { cells: string[]; isHeader: boolean }[] = [];
	node.forEach((row) => {
		if (row.type.name !== 'table_row') return;
		const cells: string[] = [];
		let isHeader = row.childCount > 0;
		row.forEach((cell) => {
			if (cell.type.name !== 'table_header') isHeader = false;
			const parts: string[] = [];
			cell.forEach((p) => parts.push(core.inline(p, { inTableCell: true })));
			cells.push(
				parts
					.map((p) => p.trim())
					.filter(Boolean)
					.join('<br>')
			);
			for (let s = 1; s < Number(cell.attrs.colspan ?? 1); s++) cells.push('');
		});
		rows.push({ cells, isHeader });
	});
	const cols = Math.max(1, ...rows.map((r) => r.cells.length));
	const header = rows.length > 0 && rows[0].isHeader ? rows[0].cells : null;
	const body = (header ? rows.slice(1) : rows).map((r) => r.cells);
	return { header, body, cols };
}

function pipeTable(node: Node, core: MarkdownSaveCore): string {
	const { header, body, cols } = tableRows(node, core);
	function pad(cells: string[]) {
		const c = [...cells];
		while (c.length < cols) c.push('');
		return `| ${c.join(' | ')} |`;
	}
	const spec = typeof node.attrs.colspec === 'string' && node.attrs.colspec ? node.attrs.colspec.split('|') : [];
	const delims: string[] = [];
	for (let i = 0; i < cols; i++) delims.push(spec[i] || '---');
	const lines = [pad(header ?? Array(cols).fill('')), `| ${delims.join(' | ')} |`, ...body.map(pad)];
	return lines.join('\n') + '\n\n';
}

export const table: MarkdownPlugin = {
	import: { blocks: { Table: readTable } },
	save: {
		nodes: { table: (node, _ctx, core) => pipeTable(node, core) },
		interrupts: (node) => node.type.name === 'table'
	}
};
