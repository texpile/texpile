import type { SyntaxNode } from '@lezer/common';
import { BLOCK_MARKUP } from '$lib/languages/typst/knowledge';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import {
	CALL_PUNCT,
	callBody,
	callEntry,
	childOf,
	children,
	identName,
	inlineBody,
	markedBody,
	stylesText,
	unquote,
	type PmMark,
	type PmNode,
	type TypstImport
} from '$lib/languages/typst/visual/core/document';
import { TYPST_CSS_COLORS } from './typstColors';

function colorValue(node: SyntaxNode, src: string): string | null {
	if (node.name === 'Ident') {
		const v = src.slice(node.from, node.to);
		return TYPST_CSS_COLORS.has(v) ? v : null;
	}
	if (node.name === 'FuncCall') {
		const id = node.firstChild;
		if (!id || id.name !== 'Ident' || src.slice(id.from, id.to) !== 'rgb') return null;
		const args = id.nextSibling;
		if (!args || args.name !== 'Args') return null;
		const real = children(args).filter((k) => !CALL_PUNCT.includes(k.name));
		if (real.length !== 1 || real[0].name !== 'Str') return null;
		const v = unquote(src.slice(real[0].from, real[0].to)).toLowerCase();
		return /^#[0-9a-f]{3,8}$/.test(v) ? v : null;
	}
	return null;
}

function fillColor(named: SyntaxNode, src: string): string | null {
	const kids = children(named).filter((k) => k.name !== 'Colon' && k.name !== 'Space');
	if (kids.length !== 2 || kids[0].name !== 'Ident' || src.slice(kids[0].from, kids[0].to) !== 'fill') return null;
	return colorValue(kids[1], src);
}

const MARK_FUNCS: Record<string, 'u' | 'sup' | 'sub'> = { underline: 'u', super: 'sup', sub: 'sub' };

function styledTextParts(args: SyntaxNode, src: string): { mark: PmMark; markup: SyntaxNode } | null {
	const kids = children(args);
	const open = kids[0];
	const close = kids.find((k) => k.name === 'RightParen');
	const body = kids[kids.length - 1];
	if (open?.name !== 'LeftParen' || !close || body?.name !== 'ContentBlock' || hasSyntaxError(args)) return null;
	const inner = src.slice(open.to, close.from);
	const markup = childOf(body, 'Markup');
	if (!inner.trim() || !markup || children(markup).some((k) => BLOCK_MARKUP.has(k.name))) return null;
	return { mark: { type: 'typ_text', attrs: { args: inner } }, markup };
}

function markCallParts(call: SyntaxNode, src: string): { mark: PmMark; markup: SyntaxNode } | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident') return null;
	const name = src.slice(ident.from, ident.to);
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args') return null;
	const real = children(args).filter((k) => !CALL_PUNCT.includes(k.name));
	function contentMarkup(n: SyntaxNode | undefined) {
		return n && n.name === 'ContentBlock' ? childOf(n, 'Markup') : null;
	}

	const plain = MARK_FUNCS[name];
	if (plain) {
		if (real.length !== 1) return null;
		const markup = contentMarkup(real[0]);
		return markup ? { mark: { type: plain }, markup } : null;
	}
	if (name === 'highlight') {
		if (real.length === 1) {
			const markup = contentMarkup(real[0]);
			return markup ? { mark: { type: 'highlight', attrs: { color: 'yellow' } }, markup } : null;
		}
		if (real.length === 2 && real[0].name === 'Named') {
			const color = fillColor(real[0], src);
			const markup = contentMarkup(real[1]);
			return color && markup ? { mark: { type: 'highlight', attrs: { color } }, markup } : null;
		}
		return null;
	}
	if (name === 'text' && real.length === 2 && real[0].name === 'Named') {
		const color = fillColor(real[0], src);
		const markup = contentMarkup(real[1]);
		if (color && markup) return { mark: { type: 'textcolor', attrs: { color } }, markup };
	}
	return name === 'text' ? styledTextParts(args, src) : null;
}

export function markCall(im: TypstImport, _hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]): PmNode[] | null {
	const parts = markCallParts(call, im.src);
	return parts ? im.core.inline(children(parts.markup), im.src, [...marks, parts.mark]) : null;
}

function styledCallParts(call: SyntaxNode, src: string): { mark: PmMark; body: SyntaxNode } | null {
	const name = identName(call, src);
	const entry = name ? callEntry(call, src) : null;
	if (!name || !entry || !stylesText(entry)) return null;
	const parts = callBody(call, src);
	if (!parts || !inlineBody(parts.body)) return null;
	if (name === 'text') return parts.args?.trim() ? { mark: { type: 'typ_text', attrs: { args: parts.args } }, body: parts.body } : null;
	return { mark: { type: 'typ_call', attrs: { name, args: parts.args } }, body: parts.body };
}

export function styledCall(im: TypstImport, _hash: SyntaxNode, call: SyntaxNode, marks: PmMark[]): PmNode[] | null {
	const styled = styledCallParts(call, im.src);
	return styled ? markedBody(im, styled.body, styled.mark, marks) : null;
}
