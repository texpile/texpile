import type { SyntaxNode } from '@lezer/common';
import type { OwnLet, TypstFileScope } from '../fileScope';
import { letParts } from './readEntry';
import { partsOf, strValue, textOf } from './syntax';

export function dictionaryEntry(dictionary: SyntaxNode, key: string, source: string): SyntaxNode | null {
	if (dictionary.name !== 'Dict') return null;
	let found: SyntaxNode | null = null;
	for (const entry of partsOf(dictionary)) {
		if (entry.name === 'Spread') found = null;
		if (entry.name !== 'Named' && entry.name !== 'Keyed') continue;
		const [name, value] = partsOf(entry).filter((p) => p.name !== 'Colon');
		const written = name?.name === 'Str' ? strValue(name, source) : name?.name === 'Ident' ? textOf(name, source) : null;
		if (written === key && value) found = value;
	}
	return found;
}

export function isMakerCall(value: SyntaxNode | null | undefined, source: string, scope: TypstFileScope): boolean {
	if (value?.name !== 'FuncCall') return false;
	const callee = value.firstChild;
	if (!callee || (callee.name === 'FieldAccess' && callee.lastChild && textOf(callee.lastChild, source) === 'with')) return false;
	return (callee.name !== 'Ident' && callee.name !== 'FieldAccess') || scope.lookup(textOf(callee, source))?.origin !== 'std';
}

export function fieldOf(own: OwnLet, field: string): OwnLet | null {
	const parts = own.value ? null : letParts(own.node, own.source);
	const base = own.value ?? parts?.body;
	if (!base || parts?.params) return null;
	if (base.name === 'Dict') {
		const value = dictionaryEntry(base, field, own.source);
		return value ? { ...own, value } : null;
	}
	return isMakerCall(base, own.source, own.scope) ? { ...own, madeField: true } : null;
}
