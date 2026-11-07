// the template a `#show:` rule hands the rest of the document to, with the fields it sets
import type { SyntaxNode } from '@lezer/common';
import { readOwnFunctionParams, paramFor, type TypstFileScope, type TypstParam, type TypstTitlePart } from '../../../knowledge';

export type TemplateField = { name: string; part: TypstTitlePart | null; value: SyntaxNode };

export type TemplateCall = { name: string; fields: TemplateField[] };

type AppliedCall = { name: string; args: SyntaxNode | null; body: string | null };

const PUNCTUATION = new Set(['LeftParen', 'RightParen', 'Comma', 'Space', 'LineComment', 'BlockComment']);

function nameOfCallee(node: SyntaxNode, source: string): string | null {
	return node.name === 'Ident' || node.name === 'FieldAccess' ? source.slice(node.from, node.to) : null;
}

/** the function and its arguments, of `f.with(..)` or a call in a closure's body; `body` names the closure's own */
function readAppliedCall(transform: SyntaxNode, source: string): AppliedCall | null {
	const plain = nameOfCallee(transform, source);
	if (plain) return { name: plain, args: null, body: null };
	const call = transform.name === 'Closure' ? transform.lastChild : transform;
	if (call?.name !== 'FuncCall' || !call.firstChild) return null;
	const callee = call.firstChild;
	const args = call.getChild('Args');
	if (transform.name === 'Closure') {
		const name = nameOfCallee(callee, source);
		const param = transform.getChild('Params')?.getChild('Ident') ?? transform.getChild('Ident');
		return name ? { name, args, body: param ? source.slice(param.from, param.to) : null } : null;
	}
	const withOf = callee.name === 'FieldAccess' && callee.lastChild && source.slice(callee.lastChild.from, callee.lastChild.to) === 'with';
	const base = withOf ? nameOfCallee(callee.firstChild!, source) : null;
	return base ? { name: base, args, body: null } : null;
}

/** the template's parameters, when the data or the project's own let holds them */
function templateParams(name: string, scope: TypstFileScope | null): TypstParam[] | null {
	const found = scope?.lookup(name);
	if (found) return found.entry.params ?? null;
	const own = scope?.own(name);
	return own ? readOwnFunctionParams(own.node, own.source) : null;
}

export function readTemplateCall(transform: SyntaxNode, source: string, scope: TypstFileScope | null): TemplateCall | null {
	const applied = readAppliedCall(transform, source);
	if (!applied) return null;
	const params = templateParams(applied.name, scope);
	const entry = { kind: 'function' as const, params: params ?? [] };
	const fields: TemplateField[] = [];
	let index = 0;
	for (let arg = applied.args?.firstChild; arg; arg = arg.nextSibling) {
		// the content after the parentheses is the body, which `.with` leaves to the rule
		if (arg.name === 'RightParen') break;
		if (PUNCTUATION.has(arg.name)) continue;
		if (arg.name !== 'Named') {
			if (applied.body !== null && source.slice(arg.from, arg.to) === applied.body) continue;
			const param = paramFor(entry, { index: index++ });
			if (param && !param.variadic) fields.push({ name: param.name, part: param.part ?? null, value: arg });
			continue;
		}
		const key = arg.firstChild;
		const value = arg.lastChild;
		if (key?.name !== 'Ident' || !value || value === key) continue;
		const name = source.slice(key.from, key.to);
		fields.push({ name, part: paramFor(entry, { name })?.part ?? null, value });
	}
	return { name: applied.name, fields };
}
