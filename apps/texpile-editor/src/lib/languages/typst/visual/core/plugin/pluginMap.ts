// the plugins each name answers to, built from the list on first use; a use's plugins are kept per file scope
import type { TypstFileScope } from '$lib/languages/typst/knowledge';
import { typstPlugins } from '../../typstPlugins';
import type { TypstPlugin, TypstUse } from './typstPlugin';

type Claims = Map<string, readonly TypstPlugin[]>;

let named: Map<string, TypstPlugin[]> | null = null;
const claimsIn = new WeakMap<TypstFileScope, Claims>();
const claimsWithoutScope: Claims = new Map();

function namedPlugins(): Map<string, TypstPlugin[]> {
	if (named) return named;
	named = new Map();
	for (const plugin of typstPlugins)
		for (const name of plugin.functions ?? []) (named.get(name) ?? named.set(name, []).get(name)!).push(plugin);
	return named;
}

/** the plugins that list the name, or for a value its module (`sym` for `sym.arrow.r`) */
function listing(form: TypstUse['form'], name: string): readonly TypstPlugin[] {
	const byName = namedPlugins().get(name) ?? [];
	const module = form === 'value' && name.includes('.') ? (namedPlugins().get(name.split('.')[0]) ?? []) : [];
	return module.length ? [...byName, ...module] : byName;
}

/** the plugins a use reaches, in the list's order */
export function usePlugins(use: TypstUse, scope: TypstFileScope | null): readonly TypstPlugin[] {
	const kept = scope ? (claimsIn.get(scope) ?? claimsIn.set(scope, new Map()).get(scope)!) : claimsWithoutScope;
	const key = `${use.form} ${use.name}`;
	let claims = kept.get(key);
	if (!claims) {
		const listed = listing(use.form, use.name);
		// a call the file names with its own let or a package's prints that, whatever Typst's of the same name draws as
		const ownName = use.form === 'call' && use.origin !== 'std';
		claims = typstPlugins.filter((plugin) => (!ownName && listed.includes(plugin)) || plugin.role?.(use));
		kept.set(key, claims);
	}
	return claims;
}

/** the plugins that list the use's name, whoever's the name is: a package value is written in Typst's own names, and
 *  counting and the settings panel read a chip by its words */
export function listedPlugins(use: Pick<TypstUse, 'form' | 'name'>): readonly TypstPlugin[] {
	const listed = listing(use.form, use.name);
	return typstPlugins.filter((plugin) => listed.includes(plugin));
}
