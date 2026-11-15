// the Lines choice written into a Typst table: its stroke and the table.hline calls between its rows
import type { Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { TableLines } from '$lib/languages/typst/visual/core';
import { headerRows } from '../typstHeaderRows';

const HLINE = 'table.hline()';

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function isLine(rule: string): boolean {
	return /^#?(?:[\w-]+\.)?hline\s*\(/.test(rule.trim());
}

// a comment or a package's own rule stays
function withLine(line: boolean, rules: unknown): string[] {
	return [...(line ? [HLINE] : []), ...strings(rules).filter((rule) => !isLine(rule))];
}

/** `tr` with the table at `pos` given every line, the three of a formal table, or none */
export function withTypstLines(tr: Transaction, pos: number, lines: TableLines): Transaction {
	const table = tr.doc.nodeAt(pos);
	if (table?.type.name !== 'table') return tr;
	const formal = lines === 'formal';
	const header = headerRows(table);
	// the line under the header: under the first row when no row is one
	let body = 0;
	while (header.has(body)) body++;
	const under = body || 1;
	table.forEach((row, offset, index) => {
		tr.setNodeMarkup(pos + 1 + offset, undefined, {
			...row.attrs,
			typRules: withLine(formal && (index === 0 || index === under), row.attrs.typRules)
		});
	});
	const args = strings(table.attrs.typArgs).filter((arg) => !/^\s*stroke\s*:/.test(arg));
	return tr.setNodeMarkup(pos, undefined, {
		...table.attrs,
		typArgs: lines === 'all' ? args : [...args, 'stroke: none'],
		typBottomRules: withLine(formal, table.attrs.typBottomRules)
	});
}

export function setTypstLines(view: EditorView, pos: number, lines: TableLines): void {
	view.dispatch(withTypstLines(view.state.tr, pos, lines));
}
