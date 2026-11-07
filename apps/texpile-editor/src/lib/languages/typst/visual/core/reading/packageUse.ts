// a chip that is one use of a package's name: `#etal`, `#gls("SE")`, `#inline("Title")`, read with what the package
// data says of it
import type { SyntaxNode } from '@lezer/common';
import { argumentText, printedText, type ScopedEntry, type TypstFileScope, type TypstParam } from '../../../knowledge';
import { readTypstCall, typstSyntax, type CallArg, type TypstCall } from './typstCall';

export type PackageUse = { name: string; found: ScopedEntry; call: TypstCall | null };

function kids(node: SyntaxNode): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = node.firstChild; c; c = c.nextSibling) if (c.name !== 'Space') out.push(c);
	return out;
}

/** the name a chip that is only `#name` or `#module.name` reads */
export function valueName(source: string): string | null {
	const parts = kids(typstSyntax(source));
	if (parts.length !== 2 || parts[0].name !== 'Hash') return null;
	const [, value] = parts;
	return (value.name === 'Ident' || value.name === 'FieldAccess') && value.to === source.trimEnd().length
		? source.slice(value.from, value.to)
		: null;
}

export function readPackageUse(source: string, scope: TypstFileScope | null): PackageUse | null {
	if (!scope || !source.startsWith('#')) return null;
	const call = readTypstCall(source);
	const name = call?.form === 'call' ? call.name : call ? null : valueName(source);
	const found = name ? scope.lookup(name) : null;
	if (!name || !found || found.origin === 'std') return null;
	return { name, found, call: call ?? null };
}

/** each parameter's argument in the call: named by name, positional in order, then the content blocks after */
export function argumentsOf(use: PackageUse): Map<TypstParam, CallArg> {
	const out = new Map<TypstParam, CallArg>();
	const params = use.found.entry.params ?? [];
	const positional = params.filter((p) => p.positional);
	const given = use.call ? [...use.call.args.filter((a) => a.name === null), ...use.call.bodies] : [];
	given.forEach((arg, i) => positional[i] && out.set(positional[i], arg));
	for (const arg of use.call?.args ?? []) {
		const param = arg.name ? params.find((p) => p.named && p.name === arg.name) : undefined;
		if (param) out.set(param, arg);
	}
	return out;
}

/** what the use prints by the data, from its arguments' text and the defaults of the ones it leaves out */
export function printedBy(use: PackageUse): string | null {
	const { entry } = use.found;
	if (entry.kind === 'value') return entry.prints ?? null;
	if (!use.call) return null;
	const args = argumentsOf(use);
	return printedText(entry, (param) => {
		const arg = args.get(param);
		if (arg) return argumentText(arg.node, use.call!.source);
		if (param.default === undefined || /^(none|""|\[\])$/.test(param.default)) return '';
		return null;
	});
}
