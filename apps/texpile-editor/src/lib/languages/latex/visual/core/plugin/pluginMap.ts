// the plugins each name answers to, built from the list once per package table; a role's names are recorded the
// first time a name is looked up
import type { PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';
import { latexPlugins } from '../../latexPlugins';
import { documentTable } from '../title/documentTable.svelte';
import type { LatexPlugin } from './latexPlugin';

type Kind = 'commands' | 'environments';
type NameMap = { table: PackageTable; commands: Map<string, readonly LatexPlugin[]>; environments: Map<string, readonly LatexPlugin[]> };

const named = { commands: new Map<string, LatexPlugin[]>(), environments: new Map<string, LatexPlugin[]>() };
for (const plugin of latexPlugins)
	for (const kind of ['commands', 'environments'] as const)
		for (const name of plugin[kind] ?? []) (named[kind].get(name) ?? named[kind].set(name, []).get(name)!).push(plugin);

let current: NameMap | null = null;

function claimsOf(kind: Kind, name: string): readonly LatexPlugin[] {
	const byName = named[kind].get(name) ?? [];
	const claims = latexPlugins.filter((plugin) => byName.includes(plugin) || plugin.role?.[kind]?.(name));
	// a package's plugin before the kernel's
	return claims.length > 1 ? [...claims.filter((p) => !p.kernel), ...claims.filter((p) => p.kernel)] : claims;
}

function lookUp(kind: Kind, name: string): readonly LatexPlugin[] {
	const table = documentTable.current;
	if (current?.table !== table) current = { table, commands: new Map(), environments: new Map() };
	let claims = current[kind].get(name);
	if (!claims) {
		claims = claimsOf(kind, name);
		current[kind].set(name, claims);
	}
	return claims;
}

export function commandPlugins(name: string): readonly LatexPlugin[] {
	return lookUp('commands', name);
}

export function environmentPlugins(name: string): readonly LatexPlugin[] {
	return lookUp('environments', name);
}

/** whether a chip that starts with the name is drawn by a plugin */
export function opensChip(kind: Kind, name: string): boolean {
	return lookUp(kind, name).some((plugin) =>
		typeof plugin.opensChip === 'function' ? plugin.opensChip(name, kind) : plugin.opensChip !== false
	);
}
