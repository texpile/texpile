import type { TypstArgRole, TypstEntry, TypstParam } from './types';

export type ArgPlace = { name: string } | { index: number };

export function paramFor(entry: TypstEntry, place: ArgPlace): TypstParam | null {
	const params = entry.params ?? [];
	if ('name' in place) return params.find((p) => p.named && p.name === place.name) ?? null;
	const positional = params.filter((p) => p.positional || p.variadic);
	const fixed = positional.filter((p) => !p.variadic);
	return fixed[place.index] ?? positional.find((p) => p.variadic) ?? null;
}

const VARIADIC_BODY_NAMES = new Set(['body', 'bodies', 'args']);

export function variadicBody(entry: TypstEntry): TypstParam | null {
	return (entry.params ?? []).find((p) => p.variadic && !p.into && VARIADIC_BODY_NAMES.has(p.name)) ?? null;
}

export function roleOf(entry: TypstEntry, place: ArgPlace): TypstArgRole | null {
	return paramFor(entry, place)?.role ?? null;
}

export function blockLevelOf(entry: TypstEntry, named: (name: string) => string | null): boolean | 'content' | null {
	if (entry.blockParam) return named(entry.blockParam)?.trim() === 'true';
	return entry.block ?? null;
}

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
