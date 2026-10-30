// the package files a document's source names: \usepackage, its class as class-<name>, the libraries and themes it loads, and the languages it declares
import { namesTried } from '../../knowledge/calls/fileCommands';
import { callsIn, type CommandCall } from '../../knowledge/calls/commandCalls';
import { blankComments } from '../../texCode';
import { packageDefining } from '../../knowledge/commands/packageFor';
import { loaderCalls, optionsOf, prefixOf } from './loaderCommands';
import { definitionsIn } from '../../knowledge/calls/definitions';
import { primitiveDefsIn } from '../../userDefinitions';

/** file: the .sty or .cls a \usepackage or \documentclass names, where the project may ship it */
export type PackageUse = { name: string; options: string[]; file?: string };

/** a comma list such as package options, one item per entry */
export function listOf(text: string | undefined): string[] {
	return (text ?? '')
		.split(',')
		.map((item) => item.trim().replace(/\s*=\s*/, '='))
		.filter(Boolean);
}

/** at: where the name stands in the text */
export type PackageUseSite = PackageUse & { at: number };

let cache: { text: string; sites: PackageUseSite[]; uses: PackageUse[] } | null = null;

// a class that loads its base by a name of its own: \providecommand{\baseclass}{book} then \LoadClass{\baseclass}
function namesDefinedIn(text: string): Map<string, string> {
	const out = new Map<string, string>();
	const bodies = [
		...definitionsIn(text).flatMap((d) => (d.kind === 'macro' && d.body !== undefined ? [{ name: d.name, body: d.body }] : [])),
		...primitiveDefsIn(text).flatMap((d) => (d.body !== null ? [{ name: d.name, body: d.body }] : []))
	];
	for (const { name, body } of bodies) if (/^\s*[\w.\-/]+\s*$/.test(body) && !out.has(name)) out.set(name, body.trim());
	return out;
}

function usesOf(text: string, call: CommandCall, names: () => Map<string, string>): PackageUseSite[] {
	const options = listOf(optionsOf(text, call)).flatMap((o) => (o.startsWith('main=') ? [o, o.slice(5)] : [o]));
	return call.args.flatMap(({ arg, values }) => {
		const prefix = prefixOf(arg);
		return values
			.map(({ value, at }) => ({ name: /^\\[a-zA-Z@]+$/.test(value) ? (names().get(value.slice(1)) ?? value) : value, at }))
			.map(({ name, at }) => ({
				name: prefix + name,
				options,
				at,
				...(arg.ext ? { file: namesTried(arg, (arg.library ?? '') + name)[0] } : {})
			}));
	});
}

/** the uses in reading order, each with where its name stands */
export function packageUseSitesIn(text: string): PackageUseSite[] {
	if (cache?.text === text) return cache.sites;
	const masked = blankComments(text);
	let names: Map<string, string> | null = null;
	function named(): Map<string, string> {
		names ??= namesDefinedIn(masked);
		return names;
	}
	const found: { at: number; uses: PackageUseSite[] }[] = loaderCalls(masked).map((call) => ({
		at: call.at,
		uses: usesOf(masked, call, named)
	}));
	for (const call of callsIn(masked, ['language'])) {
		const declared = call.args.find((a) => a.arg.declaration);
		const name = declared && packageDefining('command', call.command);
		if (name) found.push({ at: call.at, uses: [{ name, options: declared.values.map((v) => v.value), at: call.at }] });
	}
	const sites = found.sort((a, b) => a.at - b.at).flatMap((f) => f.uses);
	cache = { text, sites, uses: sites.map(({ at: _, ...use }) => use) };
	return sites;
}

export function packageUsesIn(text: string): PackageUse[] {
	packageUseSitesIn(text);
	return cache!.uses;
}
