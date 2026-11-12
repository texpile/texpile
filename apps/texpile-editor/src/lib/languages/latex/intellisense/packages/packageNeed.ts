// a package something written into the document needs, and the preamble with it loaded
import { addPackageInsertion } from './packageInsertion';
import { documentPackagesNow, preambleOf } from './loadedPackages';
import { packageUsesIn } from './packageUses';
import { stackedCommands, stackedEnvironments } from '$lib/languages/latex/knowledge/stackedEntries';

/** `environment` or `command`: what the package is needed for, which another loaded package may give already */
export type PackageNeed = { name: string; environment?: string; command?: string };

export function loadsNeed(preamble: string, need: PackageNeed): boolean {
	const loaded = documentPackagesNow(preamble);
	if (!loaded) return packageUsesIn(preamble).some((use) => use.name === need.name);
	if (need.environment) return stackedEnvironments(loaded).has(need.environment);
	return !!need.command && stackedCommands(loaded).has(need.command);
}

/** `text` is a preamble or a whole file */
export function withPackageNeeded(text: string, need: PackageNeed): string {
	if (loadsNeed(preambleOf(text), need)) return text;
	const at = addPackageInsertion(text, need.name);
	return at ? text.slice(0, at.at) + at.insert + text.slice(at.at) : text;
}
