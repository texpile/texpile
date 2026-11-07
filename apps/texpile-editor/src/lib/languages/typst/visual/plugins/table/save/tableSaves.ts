// a table, its rows and cells written on their own, and a figure of a table
import type { Node } from 'prosemirror-model';
import {
	bodyIndent,
	captionValue,
	figureSource,
	type Ctx,
	type TypstNodeSave,
	type TypstSaveCore
} from '$lib/languages/typst/visual/core/document';
import { cellCall, rowCells, tableBody } from './tableSerializer';

function wholeTable(node: Node, _ctx: unknown, core: TypstSaveCore): string {
	const body = tableBody(node, '', core);
	return body ? `#${body}\n\n` : '';
}

function tableWrapper(node: Node, ctx: Ctx, core: TypstSaveCore): string {
	let table: Node | null = null;
	let captionNode: Node | null = null;
	node.forEach((c) => {
		if (c.type.name === 'table') table = c;
		else if (c.type.name === 'table_caption') captionNode = c;
	});
	if (!table) return '';
	const body = tableBody(table, '  ', core);
	if (!body) return '';
	const cap = captionNode as Node | null;
	const caption = cap && cap.childCount > 0 ? core.bracketed(cap) : '';
	const label = core.label(node);
	const shown = cap && (cap.childCount > 0 || node.attrs.typCaption) ? captionValue(cap, core.bracketed) : null;
	const fileIndent = core.fileIndent(node, ctx);
	const inner = tableBody(table, bodyIndent(node.attrs.typFigure, fileIndent), core);
	const written = figureSource(node.attrs.typFigure, { body: inner, caption: shown, label }, fileIndent);
	if (written != null) return written + '\n\n';
	return `#figure(\n  ${body}${caption || node.attrs.typCaption ? `,\n  caption: [${caption}]` : ''},\n)${label}\n\n`;
}

export const tableSaves: Readonly<Record<string, TypstNodeSave>> = {
	table: wholeTable,
	table_row: (node, _ctx, core) => rowCells(node, core),
	table_cell: (node, _ctx, core) => cellCall(node, core),
	table_header: (node, _ctx, core) => cellCall(node, core),
	table_wrapper: tableWrapper
};
