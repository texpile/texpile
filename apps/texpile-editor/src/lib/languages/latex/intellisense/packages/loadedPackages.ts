// the package files a document loads: the kernel, each use and what it loads in turn
import { packageUsesIn, type PackageUse } from './packageUses';
import { loadFiles, type LoadedFile } from '../../knowledge/loadedFiles';
import { userFilesVersion } from '../../knowledge/userFiles';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { detectEngine, type Engine } from '$lib/workspace/compileCommand';
import { resolveFormatCommand } from '$lib/workspace/compileResolve';
import { projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
import { hostEngine } from '$lib/collab/parse/followParseContext.svelte';

export type { LoadedFile };

export const KERNEL_PACKAGE = 'latex-document';
// a file that names no class reads like one in article, which most classes build on
const DEFAULT_CLASS = 'class-article';

/** the engine the folder's LaTeX command runs (the host's in a session), null when the command does not name one */
export function compileEngine(): Engine | null {
	if (hostEngine.current !== undefined) return hostEngine.current;
	// a command waiting on "Use this command?" is still the folder's
	const pending = projectConfigSync.pending;
	return detectEngine(pending?.format === 'latex' ? pending.command : resolveFormatCommand('latex'));
}

/** a package and what it loads, the kernel left out */
export function packagesLoadedBy(name: string): Promise<LoadedFile[]> {
	return loadFiles([{ name, options: [] }], [], compileEngine());
}

// a few documents' worth: completion and the visual editor's menus ask about different texts
const cache = new Map<string, Promise<LoadedFile[]>>();
const settled = new Map<string, LoadedFile[]>();
const CACHED = 8;

function keyOf(uses: PackageUse[], engine: Engine | null): string {
	return `${userFilesVersion()}:${engine}:${JSON.stringify(uses)}`;
}

/** the kernel, the class, then every use with what it loads */
export function loadedPackages(uses: PackageUse[]): Promise<LoadedFile[]> {
	const engine = compileEngine();
	const key = keyOf(uses, engine);
	let loaded = cache.get(key);
	if (!loaded) {
		const classes = uses.filter((u) => u.name.startsWith('class-'));
		const classOptions = classes.flatMap((u) => u.options);
		const first = [{ name: KERNEL_PACKAGE, options: [] }, ...(classes.length ? [] : [{ name: DEFAULT_CLASS, options: [] }])];
		const started = loadFiles([...first, ...uses], classOptions, engine);
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
export function documentPackages(text: string): Promise<LoadedFile[]> {
	return loadedPackages(documentUses(text));
}

function namesOf(loaded: LoadedFile[]): Set<string> {
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
