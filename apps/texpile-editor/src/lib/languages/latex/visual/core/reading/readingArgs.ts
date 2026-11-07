import type { Argument, Role } from '$lib/languages/latex/knowledge/types';
import { commonCommand, rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { TreeArg, TreeCall } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { documentTable } from '../title/documentTable.svelte';

export function readingsOf(name: string): (readonly Argument[])[] {
	const { macros } = documentTable.current;
	const common = commonCommand(name)?.args;
	return [...(Object.hasOwn(macros, name) ? [macros[name]] : []), ...(common ? [common] : [])];
}

export function readsArg(name: string, test: (a: Argument) => boolean): boolean {
	return readingsOf(name).some((reading) => reading.some(test));
}

function kindOf(a: { kind: string }): string {
	return a.kind.replace(/^!/, '');
}

export function argWhere(call: TreeCall, test: (a: Argument) => boolean): TreeArg | null {
	const reading = readingsOf(call.name).find((r) => r.some(test));
	if (!reading) return null;
	const index = reading.findIndex(test);
	const kind = kindOf(reading[index]);
	const nth = reading.slice(0, index).filter((a) => kindOf(a) === kind).length;
	return call.args.filter((a) => kindOf(a) === kind)[nth] ?? null;
}

export function hasRole(role: Role): (a: Argument) => boolean {
	return (a) => rolesOf(a).includes(role);
}
