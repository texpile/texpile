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

/** an expression as a source wrote it, read with the names of the body it stands in (null: the caller's); or a value worked out */
export type Binding = { node: SyntaxNode; source: string; reading: BodyReading | null } | { literal: TypstLiteral };

/** null: a named parameter given nothing */
export type Bound = Map<string, Binding | null>;

/** the body being drawn: its text, the names it binds and what they hold (a sink holds nothing it can draw), and the
 *  let it is the body of, whose file holds the other names it reads */
export type BodyReading = { source: string; names: Set<string>; bound: Bound; own: OwnLet };

/** Typst written for the value */
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

/** the text the value prints; null for one past what the editor can work out */
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
