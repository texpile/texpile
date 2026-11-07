// #table and its span/colspec plumbing
import type { SyntaxNode } from '@lezer/common';
import {
	blockSpanOf,
	CALL_PUNCT,
	children,
	columnCount,
	drawsRule,
	noteBlockSpan,
	restOnlySpace,
	type BlockSpan,
	type PmNode,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';
import { contentBlockCell, spannedCell, tableMethod } from './tableCells';

export type TableParts = {
	colspec: string;
	align: string | null;
	extraArgs: string[];
	rowRules: string[][];
	bottomRules: string[];
	rows: PmNode[][];
};

export function tableParts(im: TypstImport, call: SyntaxNode): TableParts | null {
	const src = im.src;
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'table') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args' || args.firstChild?.name !== 'LeftParen') return null;
	// named arguments may stand anywhere among the cells, and a line comment between rows rides with the rules there.
	// align: is pulled out because it carries a per-column staleness rule the serializer enforces; the rest (any
	// other align: too) only have to survive, verbatim and in source order
	let value: SyntaxNode | null = null;
	let align: string | null = null;
	const extraArgs: string[] = [];
	const items: SyntaxNode[] = [];
	for (const a of children(args).filter((c) => !CALL_PUNCT.includes(c.name))) {
		if (a.name === 'BlockComment') return null;
		if (a.name === 'LineComment' && !items.length) extraArgs.push(src.slice(a.from, a.to));
		else if (a.name !== 'Named') items.push(a);
		else {
			const parts = children(a);
			const key = parts[0]?.name === 'Ident' ? src.slice(parts[0].from, parts[0].to) : '';
			const aValue = parts.slice(parts.findIndex((c) => c.name === 'Colon') + 1).find((c) => c.name !== 'Space');
			if (!aValue) return null;
			if (key === 'columns') {
				if (value) return null; // a second columns: is not a shape this rebuilds
				value = aValue;
			} else if (key === 'align' && align == null && ['Array', 'Ident', 'FieldAccess'].includes(aValue.name)) {
				align = src.slice(aValue.from, aValue.to);
			} else extraArgs.push(src.slice(a.from, a.to));
		}
	}
	if (!value) return null;
	const colsFound = columnCount(value, src);
	if (colsFound == null) return null;
	const cols: number = colsFound;

	const covered = new Set<string>();
	function at(rr: number, cc: number) {
		return `${rr},${cc}`;
	}
	const rows: PmNode[][] = [];
	const rowRules: string[][] = [];
	let pending: string[] = [];
	let r = 0;
	let c = 0;
	let headerEnd = -1;
	function advance() {
		for (;;) {
			while (c < cols && covered.has(at(r, c))) c++;
			if (c < cols) return;
			r++;
			c = 0;
		}
	}
	function atRowBoundary(): boolean {
		if (c !== 0 && c < cols) return false;
		if (c >= cols) {
			r++;
			c = 0;
		}
		return true;
	}
	function place(item: SyntaxNode, headerCell: boolean): boolean {
		const method = tableMethod(item, src);
		if (method && method !== 'table.cell') return false;
		const span = method === 'table.cell' ? spannedCell(im, item, headerCell) : null;
		if (method === 'table.cell' && !span) return false;
		const cell = span ? span.cell : contentBlockCell(im, item, headerCell);
		if (!cell) return false;
		const colspan = span?.colspan ?? 1;
		const rowspan = span?.rowspan ?? 1;
		advance();
		if (c + colspan > cols) return false; // the cell overruns the declared grid
		while (rows.length <= r) {
			rows.push([]);
			rowRules.push([]);
		}
		if (pending.length) {
			rowRules[r].push(...pending);
			pending = [];
		}
		rows[r].push(cell);
		if (headerCell) headerEnd = Math.max(headerEnd, r + rowspan - 1);
		for (let dr = 1; dr < rowspan; dr++) for (let dc = 0; dc < colspan; dc++) covered.add(at(r + dr, c + dc));
		c += colspan;
		return true;
	}

	for (const item of items) {
		const method = tableMethod(item, src);
		if (method === 'table.hline' || item.name === 'LineComment' || drawsRule(item, src)) {
			if (!atRowBoundary()) return null;
			pending.push(src.slice(item.from, item.to));
			continue;
		}
		if (method === 'table.header') {
			if (!atRowBoundary()) return null;
			const hArgs = item.firstChild!.nextSibling;
			if (!hArgs || hArgs.name !== 'Args') return null;
			headerEnd = -1;
			const headerCells = children(hArgs).filter((h) => !CALL_PUNCT.includes(h.name));
			for (const cell of headerCells) if (!place(cell, true)) return null;
			// an empty table.header() is still a header row in typst, of empty cells
			if (!headerCells.length) {
				advance();
				headerEnd = r;
				while (rows.length <= r) {
					rows.push([]);
					rowRules.push([]);
				}
				rowRules[r].push(...pending);
				pending = [];
			}
			while ((c > 0 || !headerCells.length) && c < cols) {
				if (!covered.has(at(r, c))) rows[r].push(im.core.node('table_header', null, [im.core.node('paragraph')]));
				c++;
			}
			// typst grows the header down to every row its merged cells reach, and the body starts below
			// it: the cells after table.header never fill the gaps beside a rowspan
			for (let rr = r + 1; rr <= headerEnd; rr++) {
				while (rows.length <= rr) {
					rows.push([]);
					rowRules.push([]);
				}
				for (let cc = 0; cc < cols; cc++)
					if (!covered.has(at(rr, cc))) rows[rr].push(im.core.node('table_header', null, [im.core.node('paragraph')]));
			}
			if (headerEnd > r) {
				r = headerEnd;
				c = cols;
			}
			continue;
		}
		if (!place(item, false)) return null;
	}
	if (rows.length === 0) return null;

	// typst adds the rows a rowspan reaches past the last one
	const lastRow = rows.length - 1;
	for (const key of covered) {
		const rr = Number(key.split(',')[0]);
		while (rows.length <= rr) {
			rows.push([]);
			rowRules.push([]);
		}
	}
	for (let rr = lastRow; rr < rows.length; rr++) {
		let width = rows[rr].reduce((w, cell) => w + Number(cell.attrs.colspan ?? 1), 0);
		for (let cc = 0; cc < cols; cc++) if (covered.has(at(rr, cc))) width++;
		while (width < cols) {
			rows[rr].push(im.core.node('table_cell', null, [im.core.node('paragraph')]));
			width++;
		}
	}
	return { colspec: src.slice(value.from, value.to), align, extraArgs, rowRules, bottomRules: pending, rows };
}

export function buildTableNode(im: TypstImport, t: TableParts): PmNode | null {
	const rowNodes: PmNode[] = [];
	t.rows.forEach((cells, i) => {
		const row = im.core.node('table_row', { topRules: '', typRules: t.rowRules[i] ?? [] }, cells);
		const placed = cells.map((c) => blockSpanOf(c)).filter((s): s is BlockSpan => !!s);
		rowNodes.push(
			placed.length > 0 && placed.length === cells.length
				? noteBlockSpan(row, {
						srcFrom: Math.min(...placed.map((s) => s.srcFrom)),
						srcTo: Math.max(...placed.map((s) => s.srcTo)),
						size: 1
					})
				: row
		);
	});
	if (rowNodes.length === 0) return null;
	return im.core.node(
		'table',
		{ env: null, colspec: t.colspec, typAlign: t.align, typArgs: t.extraArgs, typBottomRules: t.bottomRules },
		rowNodes
	);
}
export function tableSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	if (!call || !restOnlySpace(kids, i + 2, im.src)) return null;
	const t = tableParts(im, call);
	if (!t) return null;
	const node = buildTableNode(im, t);
	if (!node) return null;
	return { seg: { blocks: [node], from: hash.from, to: call.to }, next: i + 2 };
}
