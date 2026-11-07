// what a call means by the data: which parameter an argument fills, its role, whether the call is block-level and
// what it prints
import type { TypstArgRole, TypstEntry, TypstParam } from './types';

/** an argument as a call writes it: named, or the index-th positional one */
export type ArgPlace = { name: string } | { index: number };

export function paramFor(entry: TypstEntry, place: ArgPlace): TypstParam | null {
	const params = entry.params ?? [];
	if ('name' in place) return params.find((p) => p.named && p.name === place.name) ?? null;
	const positional = params.filter((p) => p.positional || p.variadic);
	const fixed = positional.filter((p) => !p.variadic);
	return fixed[place.index] ?? positional.find((p) => p.variadic) ?? null;
}

// the names a package gives the rest of a call it hands on
const VARIADIC_BODY_NAMES = new Set(['body', 'bodies', 'args']);

/** the variadic parameter a call's body goes into (`info(..args)` handing it on to a clue), not one it is spread `into` */
export function variadicBody(entry: TypstEntry): TypstParam | null {
	return (entry.params ?? []).find((p) => p.variadic && !p.into && VARIADIC_BODY_NAMES.has(p.name)) ?? null;
}

export function roleOf(entry: TypstEntry, place: ArgPlace): TypstArgRole | null {
	return paramFor(entry, place)?.role ?? null;
}

/** whether a call is block-level: `content` when it is as block-level as the content it is given; null when not known.
 *  `named` is the source of a named argument the call gives, or null */
export function blockLevelOf(entry: TypstEntry, named: (name: string) => string | null): boolean | 'content' | null {
	if (entry.blockParam) return named(entry.blockParam)?.trim() === 'true';
	return entry.block ?? null;
}

/** a call's printed text from its arguments' text; null when the data has no text for it or an argument is missing.
 *  `textOf` is an argument's text, or null when it is not plain text */
export function printedText(entry: TypstEntry, textOf: (param: TypstParam) => string | null): string | null {
	const prints = entry.prints;
	if (prints === undefined) return null;
	let missing = false;
	const text = prints.replace(/\{([\w-]+)\}/g, (_whole, name: string) => {
		const param = entry.params?.find((p) => p.name === name);
		const value = param ? textOf(param) : null;
		if (value === null) missing = true;
		return value ?? '';
	});
	return missing ? null : text;
}
