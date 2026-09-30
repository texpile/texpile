// the three spellings of a reference the typ_ref atom holds: `@target`, `@target[supplement]`
// and `#cite(<target>, supplement: [..], form: "..")`; any richer call stays a chip
import type { SyntaxNode } from '@lezer/common';
import { CALL_PUNCT, children, unquote } from './inlineConvert';

// the forms typst's cite takes as a string; `none` and anything computed stay a chip
const CITE_FORMS = ['normal', 'prose', 'full', 'author', 'year'] as const;

export type RefParts = { target: string; supplement: string | null; form: string | null };

/** the bytes between a content block's brackets, or null when it is not closed */
function blockInner(block: SyntaxNode, src: string): string | null {
	const open = block.firstChild;
	const close = block.lastChild;
	if (!open || !close || open.name !== 'LeftBracket' || close.name !== 'RightBracket' || open === close) return null;
	return src.slice(open.to, close.from);
}

/** `@target` or `@target[supplement]` */
export function refMarkupParts(ref: SyntaxNode, src: string): RefParts | null {
	const kids = children(ref);
	const marker = kids[0];
	if (!marker || marker.name !== 'RefMarker') return null;
	const target = src.slice(marker.from + 1, marker.to);
	if (kids.length === 1) return { target, supplement: null, form: null };
	if (kids.length !== 2 || kids[1].name !== 'ContentBlock') return null;
	const supplement = blockInner(kids[1], src);
	return supplement == null ? null : { target, supplement, form: null };
}

/** the value of a `supplement: [..]` or `form: ".."` argument, or null for any other */
function namedValue(named: SyntaxNode, src: string): { key: string; value: string } | null {
	const parts = children(named).filter((c) => c.name !== 'Colon' && c.name !== 'Space');
	if (parts.length !== 2 || parts[0].name !== 'Ident') return null;
	const key = src.slice(parts[0].from, parts[0].to);
	if (key === 'supplement' && parts[1].name === 'ContentBlock') {
		const inner = blockInner(parts[1], src);
		return inner == null ? null : { key, value: inner };
	}
	if (key === 'form' && parts[1].name === 'Str') {
		const form = unquote(src.slice(parts[1].from, parts[1].to));
		return (CITE_FORMS as readonly string[]).includes(form) ? { key, value: form } : null;
	}
	return null;
}

/** `#cite(<target>, ..)` or `#ref(<target>, ..)` with nothing but a supplement (and, for cite, a
 *  form) after the label */
export function refCallParts(call: SyntaxNode, src: string): RefParts | null {
	if (call.name !== 'FuncCall') return null;
	const ident = call.firstChild;
	if (!ident || ident.name !== 'Ident') return null;
	const name = src.slice(ident.from, ident.to);
	if (name !== 'cite' && name !== 'ref') return null;
	const args = ident.nextSibling;
	if (!args || args.name !== 'Args' || args.firstChild?.name !== 'LeftParen' || args.lastChild?.name !== 'RightParen') return null;
	const real = children(args).filter((k) => !CALL_PUNCT.includes(k.name));
	if (real.length === 0 || real[0].name !== 'Label') return null;
	const out: RefParts = { target: src.slice(real[0].from + 1, real[0].to - 1), supplement: null, form: null };
	for (const arg of real.slice(1)) {
		const named = arg.name === 'Named' ? namedValue(arg, src) : null;
		if (!named || (named.key === 'form' && name !== 'cite')) return null;
		if (named.key === 'supplement') {
			if (out.supplement != null) return null;
			out.supplement = named.value;
		} else {
			if (out.form != null) return null;
			out.form = named.value;
		}
	}
	return out;
}
