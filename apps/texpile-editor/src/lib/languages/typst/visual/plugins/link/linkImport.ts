// `#link("...")[...]`, `#link("https://...")` and `#link(<label>)[..]`, and a url in prose: a link mark over the text
import type { SyntaxNode } from '@lezer/common';
import {
	callBody,
	childOf,
	children,
	identName,
	inlineBody,
	markedBody,
	singleArgCall,
	unquote,
	type PmMark,
	type PmNode,
	type TypstImport
} from '$lib/languages/typst/visual/core/document';

export function bareLink(href: string): PmMark {
	return { type: 'link', attrs: { href, title: null, bare: true } };
}

export function bareLinkHref(call: SyntaxNode, src: string): string | null {
	const parts = singleArgCall(call, src, 'link');
	if (!parts || parts.content || parts.arg.name !== 'Str') return null;
	const href = unquote(src.slice(parts.arg.from, parts.arg.to));
	return /^https?:\/\/\S+$/.test(href) ? href : null;
}

export function linkParts(call: SyntaxNode, src: string): { href: string; markup: SyntaxNode } | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident' || src.slice(ident.from, ident.to) !== 'link') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((k) => !['LeftParen', 'RightParen', 'Comma', 'Space'].includes(k.name));
	if (real.length !== 2 || real[0].name !== 'Str' || real[1].name !== 'ContentBlock') return null;
	const markup = childOf(real[1], 'Markup');
	if (!markup) return null;
	return { href: unquote(src.slice(real[0].from, real[0].to)), markup };
}

function linkCallParts(call: SyntaxNode, src: string): { dest: string; body: SyntaxNode } | null {
	if (identName(call, src) !== 'link') return null;
	const parts = callBody(call, src);
	const dest = parts?.args?.trim();
	if (!parts || !dest || /,/.test(dest) || !inlineBody(parts.body)) return null;
	return { dest, body: parts.body };
}

function linkMark(dest: string): PmMark {
	const href = dest.startsWith('"') ? unquote(dest) : dest;
	return { type: 'link', attrs: { href, title: null, bare: false, typDest: dest.startsWith('"') ? null : dest } };
}

export function linkCall(im: TypstImport, _hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]): PmNode[] | null {
	const link = linkCallParts(call, im.src);
	return link ? markedBody(im, link.body, linkMark(link.dest), marks) : null;
}
