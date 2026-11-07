// the value an expression of an own body has when nothing has to run to know it: a condition, a joined string
import type { SyntaxNode } from '@lezer/common';
import { calleePath, stdEntry, type OwnLet } from '../../../../knowledge';
import { letNames } from '../../../../knowledge/scan/moduleScope';
import { letParts } from '../../../../knowledge/scan/readEntry';
import { partsOf, strValue, textOf } from '../../../../knowledge/scan/syntax';
import type { BodyReading, Binding, TypstLiteral } from './bindings';

/** content: a value that is not none, whatever it prints */
export type KnownValue = TypstLiteral | 'content';

const MOST_DEPTH = 8;

const ASSIGNS = new Set(['Eq', 'PlusEq', 'HyphEq', 'StarEq', 'SlashEq']);

/** `flag = true` anywhere in the statement */
function assigns(node: SyntaxNode, source: string, name: string): boolean {
	let found = false;
	node.cursor().iterate((n) => {
		if (found) return false;
		if (n.name !== 'Binary') return true;
		const [left, op] = partsOf(n.node);
		found = left?.name === 'Ident' && !!op && ASSIGNS.has(op.name) && textOf(left, source) === name;
		return !found;
	});
	return found;
}

/** the let a body's name reads: the last one of the file before the body's let, as a closure keeps it, else the
 *  scope's; null when the file assigns the name after its let, which only running tells */
export function letRead(own: OwnLet, name: string): OwnLet | null {
	for (let at = own.node.prevSibling; at; at = at.prevSibling) {
		if (at.name === 'LetBinding' && letNames(at, own.source).includes(name)) return { ...own, name, node: at };
		if (assigns(at, own.source, name)) return null;
	}
	return own.scope.own(name);
}

function bindingValue(binding: Binding | null, depth: number): KnownValue | null {
	if (!binding) return { kind: 'none' };
	if ('literal' in binding) return binding.literal;
	return knownValue(binding.node, binding.source, binding.reading, depth + 1);
}

function nameValue(name: string, reading: BodyReading | null, depth: number): KnownValue | null {
	if (!reading) return null;
	if (reading.bound.has(name)) return bindingValue(reading.bound.get(name) ?? null, depth);
	if (reading.names.has(name)) return null;
	const own = letRead(reading.own, name);
	const parts = own ? letParts(own.node, own.source) : null;
	if (!own || !parts?.body || parts.params) return null;
	return knownValue(parts.body, own.source, { source: own.source, names: new Set(), bound: new Map(), own }, depth + 1);
}

function sameValue(a: KnownValue, b: KnownValue): boolean | null {
	if (a === 'content' || b === 'content') return a === b ? null : false;
	if (a.kind !== b.kind) return false;
	return 'value' in a && 'value' in b ? a.value === b.value : true;
}

/** `+` of two strings or two numbers */
function sum(a: TypstLiteral, b: TypstLiteral): KnownValue | null {
	if (a.kind === 'str' && b.kind === 'str') return { kind: 'str', value: a.value + b.value };
	if (a.kind !== 'number' || b.kind !== 'number') return null;
	const value = a.value + b.value;
	const int = a.int && b.int;
	return { kind: 'number', value, int, text: int || !Number.isInteger(value) || Math.abs(value) >= 1e21 ? String(value) : `${value}.0` };
}

function binaryValue(node: SyntaxNode, source: string, reading: BodyReading | null, depth: number): KnownValue | null {
	const [left, op, right] = partsOf(node);
	if (!left || !op || !right) return null;
	const a = knownValue(left, source, reading, depth);
	if (op.name === 'And' || op.name === 'Or') {
		if (a === null || a === 'content' || a.kind !== 'bool') return null;
		if (a.value === (op.name === 'Or')) return a;
	}
	const b = knownValue(right, source, reading, depth);
	if (a === null || b === null) return null;
	switch (op.name) {
		case 'And':
		case 'Or':
			return b !== 'content' && b.kind === 'bool' ? b : null;
		case 'EqEq':
		case 'ExclEq': {
			const same = sameValue(a, b);
			return same === null ? null : { kind: 'bool', value: same === (op.name === 'EqEq') };
		}
		case 'Plus':
			return a === 'content' || b === 'content' ? null : sum(a, b);
		default:
			return null;
	}
}

/** `reading` null: an expression the caller wrote, whose names are the caller's */
export function knownValue(node: SyntaxNode, source: string, reading: BodyReading | null, depth = 0): KnownValue | null {
	if (depth > MOST_DEPTH) return null;
	switch (node.name) {
		case 'None':
		case 'Auto':
			return { kind: node.name === 'None' ? 'none' : 'auto' };
		case 'Bool':
			return { kind: 'bool', value: textOf(node, source) === 'true' };
		case 'Int':
		case 'Float':
			return { kind: 'number', value: Number(textOf(node, source)), int: node.name === 'Int', text: textOf(node, source) };
		case 'Str':
			return { kind: 'str', value: strValue(node, source) };
		case 'ContentBlock':
		case 'Equation':
			return 'content';
		case 'Parenthesized': {
			const inner = partsOf(node).filter((p) => p.name !== 'LeftParen' && p.name !== 'RightParen');
			return inner.length === 1 ? knownValue(inner[0], source, reading, depth) : null;
		}
		case 'Ident':
			return nameValue(textOf(node, source), reading, depth);
		case 'Unary': {
			const [op, operand] = partsOf(node);
			const value = op?.name === 'Not' && operand ? knownValue(operand, source, reading, depth) : null;
			return value && value !== 'content' && value.kind === 'bool' ? { kind: 'bool', value: !value.value } : null;
		}
		case 'Binary':
			return binaryValue(node, source, reading, depth);
		default:
			return null;
	}
}

const NUMBER_TYPES = ['any', 'int', 'float', 'decimal', 'length', 'ratio', 'relative', 'angle', 'fraction'];

/** whether an expression may be a number, which `+` adds where it joins content */
export function mayBeNumber(node: SyntaxNode, source: string, reading: BodyReading | null, depth = 0): boolean {
	if (depth > MOST_DEPTH) return true;
	const known = knownValue(node, source, reading);
	if (known) return known !== 'content' && known.kind === 'number';
	switch (node.name) {
		case 'Numeric':
		case 'Unary':
			return true;
		case 'Binary': {
			const [left, op, right] = partsOf(node);
			if (op?.name !== 'Plus') return op?.name === 'Minus' || op?.name === 'Star' || op?.name === 'Slash';
			return mayBeNumber(left, source, reading, depth + 1) || mayBeNumber(right, source, reading, depth + 1);
		}
		case 'Parenthesized':
			return partsOf(node).some((p) => p.name !== 'LeftParen' && p.name !== 'RightParen' && mayBeNumber(p, source, reading, depth + 1));
		case 'Ident': {
			const bound = reading?.bound.get(textOf(node, source));
			if (!bound) return false;
			if ('literal' in bound) return bound.literal.kind === 'number';
			return mayBeNumber(bound.node, bound.source, bound.reading, depth + 1);
		}
		case 'FuncCall': {
			const callee = partsOf(node)[0];
			const path = callee ? calleePath(callee, source) : null;
			const std = path && !reading?.names.has(path[0]) && !reading?.own.scope.own(path[0]) ? stdEntry(path.join('.')) : null;
			return !!std && std.kind !== 'element' && (!std.returns || std.returns.some((t) => NUMBER_TYPES.includes(t)));
		}
		default:
			return false;
	}
}
