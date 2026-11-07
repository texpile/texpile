// what the names of an own function's body hold while it is drawn
import type { SyntaxNode } from '@lezer/common';
import type { OwnLet } from '../../../../knowledge';
import { printedNumber } from './printedText';

export type TypstLiteral =
	| { kind: 'none' }
	| { kind: 'auto' }
	| { kind: 'bool'; value: boolean }
	| { kind: 'number'; value: number; int: boolean; text: string }
	| { kind: 'str'; value: string };

export type Binding = { node: SyntaxNode; source: string; reading: BodyReading | null } | { literal: TypstLiteral };

export type Bound = Map<string, Binding | null>;

export type BodyReading = { source: string; names: Set<string>; bound: Bound; own: OwnLet };

export function literalCode(literal: TypstLiteral): string {
	switch (literal.kind) {
		case 'none':
		case 'auto':
			return literal.kind;
		case 'bool':
			return String(literal.value);
		case 'number':
			return literal.text;
		case 'str':
			return `"${literal.value.replace(/[\\"]/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`;
	}
}

export function literalText(literal: TypstLiteral): string | null {
	switch (literal.kind) {
		case 'none':
			return '';
		case 'number':
			return printedNumber(literal.value, literal.int);
		case 'str':
			return literal.value;
		default:
			return literalCode(literal);
	}
}
