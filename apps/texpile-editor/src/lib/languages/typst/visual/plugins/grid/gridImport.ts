import type { SyntaxNode } from '@lezer/common';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import {
	aloneWithLabel,
	children,
	lineIndent,
	type PmNode,
	type TypstImport,
	type TypstSeg
} from '$lib/languages/typst/visual/core/document';

const SKIPPED = new Set(['Space', 'Comma', 'LineComment', 'BlockComment']);

function cellOf(im: TypstImport, arg: SyntaxNode, gap: string | null): PmNode {
	const content = arg.name === 'ContentBlock' ? im.core.contentBody(arg, im.src) : null;
	if (content) return im.core.node('typ_grid_cell', { gap, bodyLead: content.bodyLead, bodyTrail: content.bodyTrail }, content.blocks);
	return im.core.node('typ_grid_cell', { gap, code: true }, [im.core.codeBody(arg, im.src)]);
}

export function gridNode(im: TypstImport, call: SyntaxNode, at: SyntaxNode, labelNode: SyntaxNode | null): PmNode | null {
	const src = im.src;
	if (call.name !== 'FuncCall' || hasSyntaxError(call)) return null;
	const callee = call.firstChild;
	const args = callee?.nextSibling;
	if (callee?.name !== 'Ident' || src.slice(callee.from, callee.to) !== 'grid' || args?.name !== 'Args' || args.nextSibling) return null;
	const parts = children(args);
	const open = parts[0];
	const close = parts[parts.length - 1];
	if (open.name !== 'LeftParen' || close.name !== 'RightParen' || open === close) return null;
	const items = parts.slice(1, -1).filter((part) => !SKIPPED.has(part.name));
	const firstCell = items.findIndex((item) => item.name !== 'Named');
	if (firstCell < 0 || items.slice(firstCell).some((item) => item.name === 'Named')) return null;
	const cellArgs = items.slice(firstCell);
	const cells = cellArgs.map((arg, n, all) => cellOf(im, arg, n === 0 ? null : src.slice(all[n - 1].to, arg.from)));
	const last = cellArgs[cellArgs.length - 1];
	const attrs = {
		args: src.slice(open.to, cellArgs[0].from),
		tail: src.slice(last.to, close.from),
		label: labelNode ? src.slice(labelNode.from + 1, labelNode.to - 1) : null,
		labelGap: labelNode ? src.slice(call.to, labelNode.from) : null,
		typIndent: lineIndent(at, at.from, src) || null
	};
	return im.core.node('typ_grid', attrs, cells);
}

export function gridSeg(im: TypstImport, kids: SyntaxNode[], i: number): { seg: TypstSeg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const alone = call ? aloneWithLabel(kids, i + 2, im.src) : null;
	const node = alone ? gridNode(im, call, hash, alone.label) : null;
	if (!alone || !node) return null;
	return { seg: { blocks: [node], from: hash.from, to: (alone.label ?? call).to }, next: alone.next };
}
