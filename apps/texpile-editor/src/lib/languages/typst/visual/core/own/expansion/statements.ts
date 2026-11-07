// the statements of an own body that print nothing themselves: a let, a style rule, the test of a condition
import type { SyntaxNode } from '@lezer/common';
import { partsOf, textOf } from '../../../../knowledge/scan/syntax';
import type { BodyReading, Binding } from './bindings';
import { knownValue } from './literals';

/** `set ..` or `show x: set ..`: styles what follows and prints nothing, so a drawing goes without it */
export function isStyleRule(node: SyntaxNode): boolean {
	if (node.name === 'SetRule') return true;
	const transform = partsOf(node).at(-1);
	return node.name === 'ShowRule' && transform?.name === 'SetRule';
}

/** the branch a condition takes, null for none; undefined when its test is not known without running */
export function chosenBranch(node: SyntaxNode, reading: BodyReading): SyntaxNode | null | undefined {
	const [, test, then, otherwise, other] = partsOf(node);
	const value = test ? knownValue(test, reading.source, reading) : null;
	if (!value || value === 'content' || value.kind !== 'bool' || !then) return undefined;
	if (value.value) return then;
	if (otherwise?.name !== 'Else' || !other) return null;
	return other.name === 'Conditional' ? chosenBranch(other, reading) : other;
}

/** `let name = value`; null for a function, a destructuring or a let without a value */
export function letBindingOf(node: SyntaxNode, reading: BodyReading): { name: string; binding: Binding | null } | null {
	const parts = partsOf(node).filter((p) => p.name !== 'Let' && p.name !== 'Eq');
	const [name, value] = parts;
	if (parts.length !== 2 || name.name !== 'Ident') return null;
	const known = knownValue(value, reading.source, reading);
	const binding: Binding = known && known !== 'content' ? { literal: known } : { node: value, source: reading.source, reading };
	return { name: textOf(name, reading.source), binding };
}
