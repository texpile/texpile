import type { SyntaxNode } from '@lezer/common';
import type { TypstEntry } from '../types';
import { textOf } from './syntax';
import type { ScopeBinding } from './moduleScope';

export type ResolvedName =
	| { kind: 'std'; entry: TypstEntry }
	| { kind: 'own'; binding: ScopeBinding & { kind: 'let' } }
	| { kind: 'other'; spec: string; name: string }
	| { kind: 'param'; name: string }
	| null;

export type NameResolver = (name: string) => ResolvedName;

export function calleePath(node: SyntaxNode, source: string): string[] | null {
	if (node.name === 'Ident' || node.name === 'MathIdent') return [textOf(node, source)];
	if (node.name !== 'FieldAccess') return null;
	const base = node.firstChild;
	const field = node.lastChild;
	if (!base || !field || field.name !== 'Ident') return null;
	const head = calleePath(base, source);
	return head ? [...head, textOf(field, source)] : null;
}

export function entryAt(root: TypstEntry, path: string[]): TypstEntry | null {
	let entry: TypstEntry | undefined = root;
	for (const part of path) {
		entry = entry?.scope && Object.hasOwn(entry.scope, part) ? entry.scope[part] : undefined;
		if (!entry) return null;
	}
	return entry;
}
