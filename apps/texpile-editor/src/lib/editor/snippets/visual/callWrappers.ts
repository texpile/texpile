// functions a snippet file gives a look: a call to one is styled text in the visual editor, any other
// call a raw chip. nothing is guessed from \newcommand or #let: the list is the file's
import type { CallLook } from '../file/snippetTypes';

export type CallDialect = 'latex' | 'typst';

const names: Record<CallDialect, ReadonlySet<string>> = { latex: new Set(), typst: new Set() };
const looks: Record<CallDialect, ReadonlyMap<string, CallLook>> = { latex: new Map(), typst: new Map() };

/** the names a parse turns into styled text; false when they are the ones already in force */
export function setCallWrappers(dialect: CallDialect, next: Iterable<string>): boolean {
	const set = new Set(next);
	const same = set.size === names[dialect].size && [...set].every((n) => names[dialect].has(n));
	names[dialect] = set;
	return !same;
}

/** the declared looks; true when a parse must run again, which a changed look alone does not need */
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
