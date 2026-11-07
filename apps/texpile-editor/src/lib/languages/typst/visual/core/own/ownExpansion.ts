// what a use of the paper's own function or value prints, as Typst markup
import type { SyntaxNode } from '@lezer/common';
import { partsOf, textOf } from '../../../knowledge/scan/syntax';
import type { BodyReading, Bound } from './expansion/bindings';
import { markupOf } from './expansion/bodyMarkup';
import { argumentsOf, type OwnUse } from './ownUse';

function readMadeFrom(body: SyntaxNode, source: string): { base: string; args: SyntaxNode[] } | null {
	if (body.name === 'Ident' || body.name === 'FieldAccess') return { base: textOf(body, source), args: [] };
	if (body.name !== 'FuncCall') return null;
	const [callee, args] = partsOf(body);
	if (callee?.name !== 'FieldAccess' || callee.lastChild?.name !== 'Ident' || textOf(callee.lastChild, source) !== 'with') return null;
	const base = callee.firstChild;
	if (!base || (base.name !== 'Ident' && base.name !== 'FieldAccess') || args?.name !== 'Args') return null;
	const given = partsOf(args).filter((a) => !['LeftParen', 'RightParen', 'Comma'].includes(a.name));
	return given.some((a) => a.name === 'ContentBlock' || a.name === 'Spread') ? null : { base: textOf(base, source), args: given };
}

function namedKey(node: SyntaxNode, source: string): string | null {
	return node.name === 'Named' && node.firstChild ? textOf(node.firstChild, source) : null;
}

function callOfMadeFrom(use: OwnUse, made: { base: string; args: SyntaxNode[] }): string {
	const { call } = use;
	if (!call) return `#${made.base}${made.args.length ? `(${made.args.map((a) => textOf(a, use.own.source)).join(', ')})` : ''}`;
	const overridden = new Set(call.args.flatMap((a) => (a.name ? [a.name] : [])));
	const own = made.args.filter((a) => !overridden.has(namedKey(a, use.own.source) ?? '')).map((a) => textOf(a, use.own.source));
	const args = [...own, ...call.args.map((a) => call.source.slice(a.from, a.to))];
	const bodies = call.bodies.map((b) => call.source.slice(b.from, b.to)).join('');
	return `#${made.base}${args.length || !bodies ? `(${args.join(', ')})` : ''}${bodies}`;
}

function readingOf(use: OwnUse): BodyReading | null {
	const given = argumentsOf(use);
	if (!given) return null;
	const bound: Bound = new Map([...given].map(([name, value]) => [name, value && { ...value, reading: null }]));
	const names = new Set((use.params ?? []).map((p) => p.name));
	return { source: use.own.source, names, bound, own: use.own };
}

export function ownMarkup(use: OwnUse): string | null {
	if (!use.params) {
		const made = readMadeFrom(use.body, use.own.source);
		if (made) return callOfMadeFrom(use, made);
		if (use.call) return null;
	}
	const reading = readingOf(use);
	return reading && markupOf(use.body, reading);
}
