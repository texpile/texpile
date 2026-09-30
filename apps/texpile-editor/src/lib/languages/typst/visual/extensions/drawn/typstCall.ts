// a Typst chip read as the one call it is (#footnote[..], #v(1em), #set page(..)) with where each argument stands, so a
// setting rewrites only its own bytes. A chip that is more than one call, or holds a spread, a condition or a syntax
// error, reads as nothing and stays code
import type { SyntaxNode } from '@lezer/common';
import { TypstParser } from 'texpile-typst-syntax-wasm';

const MOST_KEPT = 1000;
// a longer source (a template's worth of code) is read again each time rather than held
const LONGEST_KEPT = 2000;
const SKIPPED = new Set(['Space', 'LineComment', 'BlockComment']);

export type CallArg = {
	/** null for a positional argument */
	name: string | null;
	/** the value's syntax: Str, Numeric, Bool, Int, None, Auto, ContentBlock, Dict, Array, Binary, ... */
	kind: string;
	value: string;
	node: SyntaxNode;
	from: number;
	to: number;
	valueFrom: number;
	valueTo: number;
	/** the end of the comma after it, when it has one */
	commaTo: number | null;
};

export type TypstCall = {
	source: string;
	form: 'call' | 'set';
	/** the function, or the element a set rule sets: footnote, v, page, math.equation */
	name: string;
	nameFrom: number;
	nameTo: number;
	/** the arguments between the parentheses, in order */
	args: CallArg[];
	/** the content blocks after the parentheses */
	bodies: CallArg[];
	/** where the parentheses stand; null when the call has none (#footnote[..]) */
	open: number | null;
	close: number | null;
};

/** what a setting changes: named arguments set (or removed, null), positional ones by index, the first body's markup */
export type CallChange = {
	name?: string;
	named?: Record<string, string | null>;
	positional?: Record<number, string>;
	body?: string;
};

type Edit = { from: number; to: number; insert: string };

let parser: TypstParser | null = null;
// a document repeats its chips (every #v(1em), every footnote), and a face is drawn again on every change
const readCalls = new Map<string, TypstCall | null>();

function childrenOf(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) out.push(c);
	return out;
}

function broken(node: SyntaxNode): boolean {
	if (node.name === 'Error') return true;
	for (let c = node.firstChild; c; c = c.nextSibling) if (broken(c)) return true;
	return false;
}

function argOf(node: SyntaxNode, source: string): CallArg | null {
	if (node.name !== 'Named') {
		const value = source.slice(node.from, node.to);
		return {
			name: null,
			kind: node.name,
			value,
			node,
			from: node.from,
			to: node.to,
			valueFrom: node.from,
			valueTo: node.to,
			commaTo: null
		};
	}
	const kids = childrenOf(node).filter((k) => !SKIPPED.has(k.name) && k.name !== 'Colon');
	if (kids.length !== 2 || kids[0].name !== 'Ident') return null;
	const [key, value] = kids;
	return {
		name: source.slice(key.from, key.to),
		kind: value.name,
		value: source.slice(value.from, value.to),
		node: value,
		from: node.from,
		to: node.to,
		valueFrom: value.from,
		valueTo: value.to,
		commaTo: null
	};
}

type ArgList = Pick<TypstCall, 'args' | 'bodies' | 'open' | 'close'>;

function argListOf(node: SyntaxNode, source: string): ArgList | null {
	const list: ArgList = { args: [], bodies: [], open: null, close: null };
	for (const kid of childrenOf(node)) {
		const inside = list.open !== null && list.close === null;
		if (kid.name === 'LeftParen') list.open = kid.from;
		else if (kid.name === 'RightParen') list.close = kid.from;
		else if (kid.name === 'Comma' && inside && list.args.length) list.args[list.args.length - 1].commaTo = kid.to;
		else if (SKIPPED.has(kid.name)) continue;
		else if (kid.name === 'Spread') return null;
		else if (!inside && kid.name !== 'ContentBlock') return null;
		else {
			const arg = argOf(kid, source);
			if (!arg) return null;
			(inside ? list.args : list.bodies).push(arg);
		}
	}
	const names = list.args.filter((arg) => arg.name !== null).map((arg) => arg.name);
	return new Set(names).size === names.length ? list : null;
}

function callOf(form: TypstCall['form'], name: SyntaxNode | undefined, args: SyntaxNode | undefined, source: string): TypstCall | null {
	if (!name || (name.name !== 'Ident' && name.name !== 'FieldAccess') || args?.name !== 'Args') return null;
	const list = argListOf(args, source);
	if (!list || (form === 'set' && list.open === null)) return null;
	return { source, form, name: source.slice(name.from, name.to), nameFrom: name.from, nameTo: name.to, ...list };
}

/** the source's syntax tree, read as markup the way a chip stands in the document */
export function typstSyntax(source: string): SyntaxNode {
	parser ??= new TypstParser();
	return parser.parse(source).topNode;
}

function parsedCall(source: string): TypstCall | null {
	if (!/^\s*#/.test(source)) return null;
	const top = typstSyntax(source);
	if (broken(top)) return null;
	// a comment after the call (a set rule keeps the one ending its line) is kept as it is
	const kids = childrenOf(top).filter((k) => !SKIPPED.has(k.name));
	if (kids.length !== 2 || kids[0].name !== 'Hash') return null;
	const expression = kids[1];
	const parts = childrenOf(expression).filter((k) => !SKIPPED.has(k.name));
	if (expression.name === 'FuncCall') return parts.length === 2 ? callOf('call', parts[0], parts[1], source) : null;
	// a rule with `if` sets only sometimes, which no setting can show
	if (expression.name === 'SetRule') return parts.length === 3 ? callOf('set', parts[1], parts[2], source) : null;
	return null;
}

export function readTypstCall(source: string): TypstCall | null {
	const known = readCalls.get(source);
	if (known !== undefined) return known;
	const call = parsedCall(source);
	if (source.length > LONGEST_KEPT) return call;
	if (readCalls.size >= MOST_KEPT) readCalls.clear();
	readCalls.set(source, call);
	return call;
}

export function namedArg(call: TypstCall, name: string): CallArg | null {
	return call.args.find((arg) => arg.name === name) ?? null;
}

export function positionalArgs(call: TypstCall): CallArg[] {
	return call.args.filter((arg) => arg.name === null);
}

/** a content block's markup, between its brackets */
export function blockMarkup(arg: CallArg): string {
	return arg.value.slice(1, -1);
}

function lineStartOf(source: string, at: number): number {
	return source.lastIndexOf('\n', at - 1) + 1;
}

/**
 * An argument taken out with its comma, or with its whole line when it stands on one (a comment ending
 * it too). The last one, which has no comma, takes the one after the argument before it that `stays`.
 */
function removal(call: TypstCall, arg: CallArg, stays: (other: CallArg) => boolean): Edit {
	const { source } = call;
	const end = arg.commaTo ?? arg.to;
	const lineStart = lineStartOf(source, arg.from);
	const lineEnd = source.indexOf('\n', end);
	const ownLine =
		call.open !== null &&
		call.close !== null &&
		lineStart > call.open &&
		lineEnd >= 0 &&
		lineEnd < call.close &&
		/^[ \t]*$/.test(source.slice(lineStart, arg.from)) &&
		/^[ \t]*(\/\/.*)?$/.test(source.slice(end, lineEnd));
	if (ownLine) return { from: lineStart, to: lineEnd + 1, insert: '' };
	if (arg.commaTo !== null) return { from: arg.from, to: arg.commaTo + /^[ \t]*/.exec(source.slice(arg.commaTo))![0].length, insert: '' };
	const previous = call.args.slice(0, call.args.indexOf(arg)).filter(stays).pop();
	return { from: previous ? previous.to : arg.from, to: arg.to, insert: '' };
}

/** new arguments after the last one, laid out as the others are: on lines of their own when the list is */
function additions(call: TypstCall, entries: string[]): Edit[] {
	const { source } = call;
	if (call.open === null || call.close === null) return [{ from: call.nameTo, to: call.nameTo, insert: `(${entries.join(', ')})` }];
	const last = call.args[call.args.length - 1];
	if (!last) {
		const blank = /^\s*$/.test(source.slice(call.open + 1, call.close));
		return [{ from: call.open + 1, to: blank ? call.close : call.open + 1, insert: entries.join(', ') + (blank ? '' : ', ') }];
	}
	const lastEnd = last.commaTo ?? last.to;
	const closeLine = lineStartOf(source, call.close);
	const ownLines =
		/\n/.test(source.slice(call.open, call.args[0].from)) && closeLine > lastEnd && !source.slice(closeLine, call.close).trim();
	if (!ownLines) return [{ from: lastEnd, to: lastEnd, insert: (last.commaTo === null ? ', ' : ' ') + entries.join(', ') }];
	const indent = /^[ \t]*/.exec(source.slice(lineStartOf(source, last.from)))![0];
	const lines = entries.map((entry) => `${indent}${entry},\n`).join('');
	const comma: Edit[] = last.commaTo === null ? [{ from: last.to, to: last.to, insert: ',' }] : [];
	return [...comma, { from: closeLine, to: closeLine, insert: lines }];
}

function applied(source: string, edits: Edit[]): string {
	return [...edits]
		.sort((a, b) => b.from - a.from)
		.reduce((text, edit) => text.slice(0, edit.from) + edit.insert + text.slice(edit.to), source);
}

/** removals that overlap as one: the last argument's reaches back over the comma of the one before, which may go too */
function mergedRemovals(removals: Edit[]): Edit[] {
	const out: Edit[] = [];
	for (const edit of [...removals].sort((a, b) => a.from - b.from)) {
		const last = out[out.length - 1];
		if (last && edit.from <= last.to) last.to = Math.max(last.to, edit.to);
		else out.push({ ...edit });
	}
	return out;
}

/** the call with `change` made, every other byte as it was */
export function rewrittenCall(call: TypstCall, change: CallChange): string {
	const edits: Edit[] = [];
	if (change.name !== undefined && change.name !== call.name) edits.push({ from: call.nameFrom, to: call.nameTo, insert: change.name });
	const positional = positionalArgs(call);
	for (const [index, value] of Object.entries(change.positional ?? {})) {
		const arg = positional[Number(index)];
		if (arg && arg.value !== value) edits.push({ from: arg.valueFrom, to: arg.valueTo, insert: value });
	}
	const body = call.bodies[0];
	if (change.body !== undefined && body && blockMarkup(body) !== change.body) {
		edits.push({ from: body.valueFrom + 1, to: body.valueTo - 1, insert: change.body });
	}
	const added: string[] = [];
	const removals: Edit[] = [];
	function stays(arg: CallArg): boolean {
		return arg.name === null || change.named?.[arg.name] !== null;
	}
	for (const [name, value] of Object.entries(change.named ?? {})) {
		const arg = namedArg(call, name);
		if (value === null) {
			if (arg) removals.push(removal(call, arg, stays));
		} else if (!arg) added.push(`${name}: ${value}`);
		else if (arg.value !== value) edits.push({ from: arg.valueFrom, to: arg.valueTo, insert: value });
	}
	edits.push(...mergedRemovals(removals));
	const text = applied(call.source, edits);
	if (!added.length) return text;
	// new arguments go after the ones that stay
	const kept = readTypstCall(text);
	return kept ? applied(text, additions(kept, added)) : applied(call.source, [...edits, ...additions(call, added)]);
}
