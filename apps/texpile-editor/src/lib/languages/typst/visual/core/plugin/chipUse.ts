// the name a chip uses, read off its syntax whatever its arguments hold, and whose the name is in the file's scope
import type { SyntaxNode } from '@lezer/common';
import type { TypstFileScope } from '$lib/languages/typst/knowledge';
import { stdEntry } from '$lib/languages/typst/knowledge';
import { childrenOf } from '$lib/languages/typst/knowledge/scan/syntax';
import { typstSyntax, withoutTrailingLabel } from '../reading/typstCall';
import { typstScopeOfDrawing } from '../scope/fileScopeNow.svelte';
import type { TypstUse } from './typstPlugin';

const MOST_KEPT = 1000;
const LONGEST_KEPT = 2000;
const QUIET = new Set(['Space', 'LineComment', 'BlockComment', 'Semicolon']);

export type UseName = Pick<TypstUse, 'form' | 'name'>;
export type ChipUse = { use: TypstUse; scope: TypstFileScope | null };

const readNames = new Map<string, UseName | null>();

function partsOf(node: SyntaxNode): SyntaxNode[] {
	return childrenOf(node).filter((k) => !QUIET.has(k.name));
}

function nameNode(node: SyntaxNode | undefined): SyntaxNode | null {
	const inner = node?.name === 'Parenthesized' ? partsOf(node).filter((k) => k.name !== 'LeftParen' && k.name !== 'RightParen') : null;
	const named = inner?.length === 1 ? inner[0] : node;
	return named && (named.name === 'Ident' || named.name === 'FieldAccess') ? named : null;
}

function parsedName(source: string): UseName | null {
	if (!/^\s*#/.test(source)) return null;
	const kids = partsOf(typstSyntax(source));
	if (kids.length !== 2 || kids[0].name !== 'Hash') return null;
	const [, expression] = kids;
	const named =
		expression.name === 'FuncCall'
			? nameNode(partsOf(expression)[0])
			: expression.name === 'SetRule'
				? nameNode(partsOf(expression)[1])
				: nameNode(expression);
	if (!named) return null;
	const form = expression.name === 'FuncCall' ? 'call' : expression.name === 'SetRule' ? 'set' : 'value';
	return { form, name: source.slice(named.from, named.to) };
}

export function useNameOf(source: string): UseName | null {
	const written = withoutTrailingLabel(source.trim());
	const known = readNames.get(written);
	if (known !== undefined) return known;
	const name = parsedName(written);
	if (written.length > LONGEST_KEPT) return name;
	if (readNames.size >= MOST_KEPT) readNames.clear();
	readNames.set(written, name);
	return name;
}

export function chipUseOf(source: string): ChipUse | null {
	const named = useNameOf(source);
	if (!named) return null;
	const scope = typstScopeOfDrawing(source.trim());
	if (named.form === 'set' || !scope) return { use: { ...named, origin: 'std', entry: stdEntry(named.name) }, scope };
	const found = scope.lookup(named.name);
	const origin = found ? (found.origin === 'std' ? 'std' : 'package') : null;
	return { use: { ...named, origin, entry: found?.entry ?? null }, scope };
}
