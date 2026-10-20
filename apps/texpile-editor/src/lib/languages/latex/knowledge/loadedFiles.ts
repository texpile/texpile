// the files a document loads, in LaTeX's order: each one after what it loads, the reader's own layers after ours
import type { Engine } from '$lib/workspace/compileCommand';
import { loadBundled } from './bundledFiles';
import { fileIdOf, useNameOf } from './fileIds';
import { userLayers } from './userFiles';
import type { Dependency, PackageFile } from './types';

export type FileUse = { name: string; options: string[] };

export type LoadedFile = {
	id: string;
	/** the name a document loads it by: amsmath, class-article, tikzlibrarycalc */
	name: string;
	/** the bundled file, then the reader's global and folder files */
	layers: PackageFile[];
	/** its own options and the class options, which LaTeX hands every package */
	options: Set<string>;
};

/** an option, `a|b` (any of them), `!a` (without it) or `a+b` (all of them); a bare option is its `=true` form */
export function conditionHolds(condition: string, options: Set<string>): boolean {
	function has(o: string): boolean {
		return options.has(o) || options.has(o.endsWith('=true') ? o.slice(0, -5) : `${o}=true`);
	}
	return condition.split('|').some((all) => all.split('+').every((t) => (t.startsWith('!') ? !has(t.slice(1)) : has(t))));
}

export async function layersOf(name: string): Promise<PackageFile[]> {
	const shipped = await loadBundled(fileIdOf(name));
	return [...(shipped ? [shipped] : []), ...userLayers(name)];
}

// a layer's deps replace the ones below it
function depsOf(layers: PackageFile[]): Dependency[] {
	return layers.reduce<Dependency[]>((deps, l) => l.deps ?? deps, []);
}

export async function loadFiles(uses: FileUse[], classOptions: string[], engine: Engine | null): Promise<LoadedFile[]> {
	const loaded = new Map<string, LoadedFile>();
	const visiting = new Set<string>();
	async function load(name: string, options: string[]): Promise<void> {
		const known = loaded.get(name);
		if (known) {
			for (const o of options) known.options.add(o);
			return;
		}
		if (visiting.has(name)) return;
		visiting.add(name);
		const layers = await layersOf(name);
		if (!layers.length) return;
		const all = new Set([...options, ...classOptions].map((o) => o.replace(/\s*=\s*/, '=')));
		// with no engine in the command, only what every engine loads
		const deps = depsOf(layers).filter(
			(d) => (!d.if || conditionHolds(d.if, all)) && (!d.engines || (engine !== null && d.engines.includes(engine)))
		);
		const names = deps.map((d) => useNameOf(d.id));
		await Promise.all(names.map(layersOf));
		for (const n of names) await load(n, []);
		loaded.set(name, { id: fileIdOf(name), name, layers, options: all });
	}
	await Promise.all(uses.map((u) => layersOf(u.name)));
	for (const use of uses) await load(use.name, use.options);
	return [...loaded.values()];
}
