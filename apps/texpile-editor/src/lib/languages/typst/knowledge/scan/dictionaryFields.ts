// what a top-level let holds when a name reads a field of it: the entry of a dictionary written out, or the let itself
// when a call of a maker made the value
import type { SyntaxNode } from '@lezer/common';
import type { OwnLet, TypstFileScope } from '../fileScope';
import { letParts } from './readEntry';
import { partsOf, strValue, textOf } from './syntax';

/** the value of the dictionary entry with that key, when the node is a dictionary written out */
export function dictionaryEntry(dictionary: SyntaxNode, key: string, source: string): SyntaxNode | null {
	if (dictionary.name !== 'Dict') return null;
	let found: SyntaxNode | null = null;
	for (const entry of partsOf(dictionary)) {
		// a spread after the key may hold it again
		if (entry.name === 'Spread') found = null;
		if (entry.name !== 'Named' && entry.name !== 'Keyed') continue;
		const [name, value] = partsOf(entry).filter((p) => p.name !== 'Colon');
		const written = name?.name === 'Str' ? strValue(name, source) : name?.name === 'Ident' ? textOf(name, source) : null;
		if (written === key && value) found = value;
	}
	return found;
}

/** whether the value is a call of a function other than Typst's (`environments(config: c)`), and not `f.with(..)` */
export function isMakerCall(value: SyntaxNode | null | undefined, source: string, scope: TypstFileScope): boolean {
	if (value?.name !== 'FuncCall') return false;
	const callee = value.firstChild;
	if (!callee || (callee.name === 'FieldAccess' && callee.lastChild && textOf(callee.lastChild, source) === 'with')) return false;
	return (callee.name !== 'Ident' && callee.name !== 'FieldAccess') || scope.lookup(textOf(callee, source))?.origin !== 'std';
}

/** the field of a let's value as a let of its own: an entry of a dictionary, or the let that a maker's call made */
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
