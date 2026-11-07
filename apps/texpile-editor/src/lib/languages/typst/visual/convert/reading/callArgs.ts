import type { SyntaxNode } from '@lezer/common';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import { children } from './syntaxUtils';

/** role says what the node writes the item from; text is the item's bytes, or for a named one the editor writes, its
 *  key as written (`caption: `). string: the value was a string, which it stays while it is plain text */
export type CallItem = { gap: string; role: string; text: string; string?: boolean };

/** tail: what stands after the last argument, before the closing parenthesis; parens false for a call written without
 *  them (`#heading[..]`) */
export type CallArgs = { items: CallItem[]; tail: string; parens?: false };

const GAP = new Set(['Space', 'Comma', 'LineComment', 'BlockComment']);

export function namedKey(named: SyntaxNode, src: string): string {
	const ident = named.firstChild;
	return ident?.name === 'Ident' ? src.slice(ident.from, ident.to) : '';
}

export function namedValue(named: SyntaxNode): SyntaxNode | null {
	const parts = children(named);
	const colon = parts.findIndex((c) => c.name === 'Colon');
	return parts.slice(colon + 1).find((c) => c.name !== 'Space') ?? null;
}

export function callOf(call: SyntaxNode, src: string, name: string): SyntaxNode | null {
	if (call.name !== 'FuncCall' || hasSyntaxError(call)) return null;
	const ident = call.firstChild;
	if (ident?.name !== 'Ident' || src.slice(ident.from, ident.to) !== name) return null;
	const args = ident.nextSibling;
	return args?.name === 'Args' && !args.nextSibling ? args : null;
}

export function readCallArgs(
	args: SyntaxNode,
	src: string,
	read: (item: SyntaxNode) => Omit<CallItem, 'gap'> | null
): { args: CallArgs; after: SyntaxNode[] } | null {
	const kids = children(args);
	if (kids.length && kids.every((k) => k.name === 'ContentBlock')) return { args: { items: [], tail: '', parens: false }, after: kids };
	const close = kids.findIndex((k) => k.name === 'RightParen');
	if (kids[0]?.name !== 'LeftParen' || close < 0) return null;
	const after = kids.slice(close + 1);
	if (after.some((k) => k.name !== 'ContentBlock')) return null;
	const items: CallItem[] = [];
	let from = kids[0].to;
	for (const item of kids.slice(1, close)) {
		if (GAP.has(item.name)) continue;
		const read1 = item.name === 'Spread' ? null : read(item);
		if (!read1) return null;
		items.push({ gap: src.slice(from, item.from), ...read1 });
		from = item.to;
	}
	return { args: { items, tail: src.slice(from, kids[close].from) }, after };
}

export function singleArgCall(call: SyntaxNode, src: string, name: string): { arg: SyntaxNode; content: SyntaxNode | null } | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== name) return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((k) => !['LeftParen', 'RightParen', 'Comma', 'Space'].includes(k.name));
	if (real.length < 1 || real.length > 2) return null;
	const content = real[1] ?? null;
	if (content && content.name !== 'ContentBlock') return null;
	return { arg: real[0], content };
}
