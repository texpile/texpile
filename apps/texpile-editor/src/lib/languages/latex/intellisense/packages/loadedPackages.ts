// the package files a document loads: the kernel, each use and what it loads in turn
import { loadPackage, type PackageData, type PkgEntry } from './packageData';
import { packageUsesIn, type PackageUse } from './packageUses';
import { userPackagesVersion } from '../userPackages';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { detectEngine, type Engine } from '$lib/workspace/compileCommand';
import { resolveFormatCommand } from '$lib/workspace/compileResolve';
import { projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
import { hostEngine } from '$lib/collab/parse/followParseContext.svelte';

export type LoadedPackage = {
	name: string;
	contents: PackageData;
	/** its own options and the class options, which LaTeX hands every package */
	options: Set<string>;
};

export const KERNEL_PACKAGE = 'latex-document';

/** an option, `a|b` (any of them), `!a` (without it) or `a+b` (all of them); a bare option is its `=true` form */
export function conditionHolds(condition: string, options: Set<string>): boolean {
	function has(o: string): boolean {
		return options.has(o) || options.has(o.endsWith('=true') ? o.slice(0, -5) : `${o}=true`);
	}
	return condition.split('|').some((all) => all.split('+').every((t) => (t.startsWith('!') ? !has(t.slice(1)) : has(t))));
}

/** entries that exist under these options */
export function entriesUnder(entries: PkgEntry[], options: Set<string>): PkgEntry[] {
	return entries.filter((e) => !e.if || conditionHolds(e.if, options));
}

/** the engine the folder's LaTeX command runs (the host's in a session), null when the command does not name one */
export function compileEngine(): Engine | null {
	if (hostEngine.current !== undefined) return hostEngine.current;
	// a command waiting on "Use this command?" is still the folder's
	const pending = projectConfigSync.pending;
	return detectEngine(pending?.format === 'latex' ? pending.command : resolveFormatCommand('latex'));
}

// what a package loads comes before it, so a later definition is the one in effect
async function loadUses(uses: PackageUse[], classOptions: string[], engine: Engine | null): Promise<LoadedPackage[]> {
	const loaded = new Map<string, LoadedPackage>();
	const visiting = new Set<string>();
	async function load(name: string, options: string[]): Promise<void> {
		const known = loaded.get(name);
		if (known) {
			for (const o of options) known.options.add(o);
			return;
		}
		if (visiting.has(name)) return;
		visiting.add(name);
		const contents = await loadPackage(name);
		if (!contents) return;
		const all = new Set([...options, ...classOptions].map((o) => o.replace(/\s*=\s*/, '=')));
		// with no engine in the command, only what every engine loads
		const deps = (contents.deps ?? []).filter(
			(d) => (!d.if || conditionHolds(d.if, all)) && (!d.engines || (engine !== null && d.engines.includes(engine)))
		);
		await Promise.all(deps.map((d) => loadPackage(d.name)));
		for (const d of deps) await load(d.name, []);
		loaded.set(name, { name, contents, options: all });
	}
	await Promise.all(uses.map((u) => loadPackage(u.name)));
	for (const use of uses) await load(use.name, use.options);
	return [...loaded.values()];
}

/** a package and what it loads, the kernel left out */
export function packagesLoadedBy(name: string): Promise<LoadedPackage[]> {
	return loadUses([{ name, options: [] }], [], compileEngine());
}

// a few documents' worth: completion and the visual editor's menus ask about different texts
const cache = new Map<string, Promise<LoadedPackage[]>>();
const settled = new Map<string, LoadedPackage[]>();
const CACHED = 8;

function keyOf(uses: PackageUse[], engine: Engine | null): string {
	return `${userPackagesVersion()}:${engine}:${JSON.stringify(uses)}`;
}

/** the kernel, then every use with what it loads */
export function loadedPackages(uses: PackageUse[]): Promise<LoadedPackage[]> {
	const engine = compileEngine();
	const key = keyOf(uses, engine);
	let loaded = cache.get(key);
	if (!loaded) {
		const classOptions = uses.filter((u) => u.name.startsWith('class-')).flatMap((u) => u.options);
		const started = loadUses([{ name: KERNEL_PACKAGE, options: [] }, ...uses], classOptions, engine);
		loaded = started;
		cache.set(key, started);
		void started.then((done) => cache.get(key) === started && settled.set(key, done));
		for (const old of [...cache.keys()].slice(0, Math.max(0, cache.size - CACHED))) {
			cache.delete(old);
			settled.delete(old);
		}
	}
	return loaded;
}

function documentUses(text: string): PackageUse[] {
	const uses = new Map<string, PackageUse>();
	for (const use of [...packageUsesIn(text), ...projectIntelStore.current.packages]) uses.set(`${use.name}[${use.options.join(',')}]`, use);
	return [...uses.values()];
}

/** what the open file and the rest of the project load */
export function documentPackages(text: string): Promise<LoadedPackage[]> {
	return loadedPackages(documentUses(text));
}

function namesOf(loaded: LoadedPackage[]): Set<string> {
	return new Set(loaded.map((p) => p.name));
}

/** the names of what the open file and the project load, the class as class-<name> */
export async function documentPackageNames(text: string): Promise<Set<string>> {
	return namesOf(await documentPackages(text));
}

/** the names of what `text` loads itself and what those load in turn, the class as class-<name> */
export async function filePackageNames(text: string): Promise<Set<string>> {
	return namesOf(await loadedPackages(packageUsesIn(text)));
}

/** filePackageNames once it has finished for this text, else null; asking starts it */
export function filePackageNamesNow(text: string): Set<string> | null {
	const uses = packageUsesIn(text);
	const done = settled.get(keyOf(uses, compileEngine()));
	if (!done) void loadedPackages(uses);
	return done ? namesOf(done) : null;
}
