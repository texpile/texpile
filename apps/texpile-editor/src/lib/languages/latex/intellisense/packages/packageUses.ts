// the package files a document's source names: \usepackage, its class as class-<name>, the libraries and themes it loads, and the languages it declares
import { namesTried } from '../../knowledge/calls/fileCommands';
import { callsIn, type CommandCall } from '../../knowledge/calls/commandCalls';
import { packageDefining } from '../../knowledge/commands/packageFor';
import { loaderCalls, optionsOf, prefixOf } from './loaderCommands';

/** file: the .sty or .cls a \usepackage or \documentclass names, where the project may ship it */
export type PackageUse = { name: string; options: string[]; file?: string };

// `\%` is a percent sign, `\\%` a line break and then a comment
const COMMENT = /(?<!\\)((?:\\\\)*)%.*/g;

export function withoutComments(text: string): string {
	return text.replace(COMMENT, '$1');
}

/** the same with each comment's text turned into spaces, so offsets stay put */
export function blankComments(text: string): string {
	return text.replace(COMMENT, (all, slashes: string) => slashes + ' '.repeat(all.length - slashes.length));
}

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

function usesOf(text: string, call: CommandCall): PackageUseSite[] {
	const options = listOf(optionsOf(text, call)).flatMap((o) => (o.startsWith('main=') ? [o, o.slice(5)] : [o]));
	return call.args.flatMap(({ arg, values }) => {
		const prefix = prefixOf(arg);
		return values.map(({ value: name, at }) => ({
			name: prefix + name,
			options,
			at,
			...(arg.ext ? { file: namesTried(arg, name)[0] } : {})
		}));
	});
}

/** the uses in reading order, each with where its name stands */
export function packageUseSitesIn(text: string): PackageUseSite[] {
	if (cache?.text === text) return cache.sites;
	const masked = blankComments(text);
	const found: { at: number; uses: PackageUseSite[] }[] = loaderCalls(masked).map((call) => ({ at: call.at, uses: usesOf(masked, call) }));
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
