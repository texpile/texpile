import type { SyntaxNode } from '@lezer/common';
import { BLOCK_MARKUP } from '$lib/languages/typst/knowledge';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import type { PmMark, PmNode } from '../builders';
import type { TypstImport } from '../../core/plugin/typstDocumentPlugin';
import { childOf, children } from './syntaxUtils';

export type CallBody = { args: string | null; body: SyntaxNode };

export function identName(call: SyntaxNode, src: string): string | null {
	const ident = call.firstChild;
	return call.name === 'FuncCall' && ident?.name === 'Ident' ? src.slice(ident.from, ident.to) : null;
}

export function callBody(call: SyntaxNode, src: string): CallBody | null {
	const args = call.lastChild;
	if (args?.name !== 'Args' || hasSyntaxError(call)) return null;
	const kids = children(args);
	const open = kids[0]?.name === 'LeftParen' ? kids[0] : null;
	const close = open ? kids.find((k) => k.name === 'RightParen') : undefined;
	if (open && !close) return null;
	const after = close ? kids.slice(kids.indexOf(close) + 1) : kids;
	if (after.length > 1 || after.some((k) => k.name !== 'ContentBlock')) return null;
	if (after.length === 1) return { args: open && close ? src.slice(open.to, close.from) : null, body: after[0] };
	const inside = open && close ? kids.slice(1, kids.indexOf(close)).filter((k) => k.name !== 'Space' && k.name !== 'Comma') : [];
	const body = inside[inside.length - 1];
	if (!body || !['ContentBlock', 'Equation', 'Str'].includes(body.name)) return null;
	const before = inside.slice(0, -1);
	return { args: before.length ? src.slice(before[0].from, before[before.length - 1].to) : null, body };
}

export function inlineBody(body: SyntaxNode): boolean {
	const markup = body.name === 'ContentBlock' ? childOf(body, 'Markup') : null;
	return !markup || !children(markup).some((k) => BLOCK_MARKUP.has(k.name));
}

export function markedBody(im: TypstImport, body: SyntaxNode, own: PmMark, marks: PmMark[]): PmNode[] | null {
	const within = [...marks, body.name === 'Str' ? { ...own, attrs: { ...own.attrs, typStr: true } } : own];
	if (body.name === 'Str') return im.core.string(body, im.src).map((node) => im.core.withMarks(node, within));
	const markup = body.name === 'ContentBlock' ? childOf(body, 'Markup') : null;
	const nodes = im.core.inline(markup ? children(markup) : body.name === 'Equation' ? [body] : [], im.src, within);
	return nodes.length ? nodes : null;
}
