// only functions a snippet file gives a look; nothing guessed from \newcommand or #let
import type { CallLook } from '../file/snippetTypes';

export type CallDialect = 'latex' | 'typst';

const names: Record<CallDialect, ReadonlySet<string>> = { latex: new Set(), typst: new Set() };
const looks: Record<CallDialect, ReadonlyMap<string, CallLook>> = { latex: new Map(), typst: new Map() };

/** false when unchanged */
export function setCallWrappers(dialect: CallDialect, next: Iterable<string>): boolean {
	const set = new Set(next);
	const same = set.size === names[dialect].size && [...set].every((n) => names[dialect].has(n));
	names[dialect] = set;
	return !same;
}

/** true when the names changed; a new look alone needs no reparse */
export function setCallLooks(dialect: CallDialect, next: ReadonlyMap<string, CallLook>): boolean {
	looks[dialect] = next;
	return setCallWrappers(dialect, next.keys());
}

export function isCallWrapper(dialect: CallDialect, name: string): boolean {
	return names[dialect].has(name);
}

export function callWrapperNames(dialect: CallDialect): string[] {
	return [...names[dialect]];
}

export function callLookOf(dialect: CallDialect, name: string): CallLook | undefined {
	return looks[dialect].get(name);
}
