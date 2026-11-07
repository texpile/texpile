// what an element call is given to print (`#strike[..]`, `#smallcaps("..")`, `#text(red, $x$)`, `#link(<l>)[..]`), and
// the inline content it stands for with its mark over it
import type { SyntaxNode } from '@lezer/common';
import { BLOCK_MARKUP } from '$lib/languages/typst/knowledge';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import type { PmMark, PmNode } from '../builders';
import type { TypstImport } from '../../core/plugin/typstDocumentPlugin';
import { childOf, children } from './syntaxUtils';

/** what a call is given to print: a content block, an equation or a string */
export type CallBody = { args: string | null; body: SyntaxNode };

/** the callee of `name(..)`, null for a field or an expression */
export function identName(call: SyntaxNode, src: string): string | null {
	const ident = call.firstChild;
	return call.name === 'FuncCall' && ident?.name === 'Ident' ? src.slice(ident.from, ident.to) : null;
}

/** the bytes between the parentheses with the body taken out (null without parentheses), and the body: a content block
 *  after them, or the last argument inside them */
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

/** a body an inline mark can hold: no paragraph break, heading or list in it */
export function inlineBody(body: SyntaxNode): boolean {
	const markup = body.name === 'ContentBlock' ? childOf(body, 'Markup') : null;
	return !markup || !children(markup).some((k) => BLOCK_MARKUP.has(k.name));
}

/** the body's inline content with `own` over it, inside `marks`; null for a call over nothing, which no mark could hold */
export function markedBody(im: TypstImport, body: SyntaxNode, own: PmMark, marks: PmMark[]): PmNode[] | null {
	const within = [...marks, body.name === 'Str' ? { ...own, attrs: { ...own.attrs, typStr: true } } : own];
	if (body.name === 'Str') return im.core.string(body, im.src).map((node) => im.core.withMarks(node, within));
	const markup = body.name === 'ContentBlock' ? childOf(body, 'Markup') : null;
	const nodes = im.core.inline(markup ? children(markup) : body.name === 'Equation' ? [body] : [], im.src, within);
	return nodes.length ? nodes : null;
}
