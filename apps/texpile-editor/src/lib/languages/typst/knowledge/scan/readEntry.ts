// a package's let read as data: a function's parameters, whether a call is block-level, what a value prints
import type { SyntaxNode } from '@lezer/common';
import type { TypstEntry, TypstParam } from '../types';
import { childrenOf, partsOf, strValue, textOf } from './syntax';
import type { BlockReading } from './blockReading';

export type LetParts = { params: SyntaxNode | null; body: SyntaxNode | null; aliasOf: string | null };

/** the parameters and the expression of `let f(..) = body`, `let f = (..) => body` or `let v = body` */
export function letParts(node: SyntaxNode, source: string): LetParts {
	const parts = partsOf(node).filter((p) => p.name !== 'Let' && p.name !== 'Eq');
	const closure = parts.find((p) => p.name === 'Closure');
	const value = closure ? null : parts[parts.length - 1];
	const lambda = value?.name === 'Closure' ? value : null;
	const fn = closure ?? lambda;
	if (fn) {
		const inner = partsOf(fn);
		return { params: fn.getChild('Params'), body: inner[inner.length - 1] ?? null, aliasOf: null };
	}
	const body = parts.length > 1 ? parts[parts.length - 1] : null;
	return { params: null, body, aliasOf: body?.name === 'Ident' ? textOf(body, source) : null };
}

/** the parameters and the expression of a value written on its own: a closure, or any other expression */
export function valueParts(value: SyntaxNode): LetParts {
	if (value.name !== 'Closure') return { params: null, body: value, aliasOf: null };
	const inner = partsOf(value);
	return { params: value.getChild('Params'), body: inner[inner.length - 1] ?? null, aliasOf: null };
}

/** a parameter as its let writes it; `value` its default */
export type WrittenParam = { name: string; kind: 'positional' | 'named' | 'variadic'; value: SyntaxNode | null };

const PARAM_PUNCTUATION = new Set(['LeftParen', 'RightParen', 'Comma', 'Space', 'LineComment', 'BlockComment']);

/** `partial`: a parameter it cannot read was left out, a destructured one */
export function writtenParamsOf(params: SyntaxNode, source: string): { params: WrittenParam[]; partial: boolean } {
	const out: WrittenParam[] = [];
	let partial = false;
	for (const p of childrenOf(params)) {
		if (p.name === 'Ident') out.push({ name: textOf(p, source), kind: 'positional', value: null });
		else if (p.name === 'Named') {
			const [name, value, ...rest] = partsOf(p).filter((c) => c.name !== 'Colon');
			if (name?.name === 'Ident' && value && !rest.length) out.push({ name: textOf(name, source), kind: 'named', value });
			else partial = true;
		} else if (p.name === 'Spread') {
			const name = p.getChild('Ident');
			out.push({ name: name ? textOf(name, source) : '', kind: 'variadic', value: null });
		} else if (!PARAM_PUNCTUATION.has(p.name)) partial = true;
	}
	return { params: out, partial };
}

export function paramsOf(params: SyntaxNode, source: string): TypstParam[] {
	return writtenParamsOf(params, source).params.flatMap((p): TypstParam[] => {
		if (p.kind === 'positional') return [{ name: p.name, positional: true, required: true }];
		if (p.kind === 'named') return [{ name: p.name, named: true, default: textOf(p.value!, source) }];
		return p.name ? [{ name: p.name, variadic: true }] : [];
	});
}

const SHORTHANDS: Record<string, string> = { '~': ' ', '--': '–', '---': '—', '...': '…', '-?': '­' };

/** the plain text of markup that is only words, or null */
export function markupText(node: SyntaxNode, source: string, wraps: (name: string) => boolean): string | null {
	let out = '';
	for (const part of childrenOf(node)) {
		const text = textOf(part, source);
		if (part.name === 'Text') out += text;
		else if (part.name === 'Space') out += ' ';
		else if (part.name === 'Shorthand' && Object.hasOwn(SHORTHANDS, text)) out += SHORTHANDS[text];
		else if (part.name === 'Escape') out += text.slice(1);
		else if (part.name === 'Strong' || part.name === 'Emph') {
			const inner = part.getChild('Markup');
			const words = inner ? markupText(inner, source, wraps) : '';
			if (words === null) return null;
			out += words;
		} else if (part.name === 'Hash') continue;
		else {
			const words = valueText(part, source, wraps);
			if (words === null) return null;
			out += words;
		}
	}
	return out;
}

/** what an expression prints when it is text: a string, a content block of words, a styling call around one */
export function valueText(node: SyntaxNode, source: string, wraps: (name: string) => boolean): string | null {
	if (node.name === 'Str') return strValue(node, source);
	if (node.name === 'ContentBlock') {
		const markup = node.getChild('Markup');
		return markup ? markupText(markup, source, wraps) : '';
	}
	if (node.name === 'FuncCall') {
		const [callee, args] = partsOf(node);
		if (callee?.name !== 'Ident' || !args || !wraps(textOf(callee, source))) return null;
		const given = partsOf(args).filter((a) => a.name === 'ContentBlock' || a.name === 'Str');
		return given.length === 1 ? valueText(given[0], source, wraps) : null;
	}
	return null;
}

/** an entry from what the scanner read; `reading` is the body's block reading */
export function entryOf(params: TypstParam[] | null, reading: BlockReading, prints: string | null, value: string | null): TypstEntry {
	const entry: TypstEntry = { kind: params ? 'function' : 'value' };
	if (params) entry.params = params;
	if (reading === 'block') entry.block = true;
	else if (reading === 'inline') entry.block = false;
	else if (reading === 'content') entry.block = 'content';
	if (prints !== null) entry.prints = prints;
	if (value !== null) entry.value = value;
	return entry;
}
