// the names of files a loaded file may load: a dependency whose condition the data cannot settle, and the class a class builds on
import { fileIdOf, useNameOf } from '../../../knowledge/fileIds';
import { conditionHolds, loadFiles, type LoadedFile } from '../../../knowledge/loadedFiles';
import { DEFAULT_CLASS } from '../../packages/loadedPackages';
import { knownNames } from './knownNames';

const cache = new WeakMap<LoadedFile[], Map<string, Promise<ReadonlySet<string>>>>();

export const NO_POSSIBLE_NAMES: ReadonlySet<string> = new Set();

/** also: what a file the folder holds may load under a condition */
export function possibleNamesOf(loaded: LoadedFile[], also: readonly string[] = []): Promise<ReadonlySet<string>> {
	const byAlso = cache.get(loaded) ?? new Map<string, Promise<ReadonlySet<string>>>();
	cache.set(loaded, byAlso);
	const key = also.join();
	let names = byAlso.get(key);
	if (!names) {
		const have = new Set(loaded.map((f) => f.id));
		const maybe = new Set<string>([DEFAULT_CLASS, ...also]);
		for (const f of loaded)
			for (const layer of f.layers) {
				for (const d of layer.deps ?? []) if (d.if && !conditionHolds(d.if, f.options)) maybe.add(useNameOf(d.id));
				for (const p of layer.passOptions ?? []) maybe.add(useNameOf(p));
			}
		const uses = [...maybe].filter((n) => !have.has(fileIdOf(n))).map((name) => ({ name, options: [] }));
		names = loadFiles(uses, [], null).then(knownNames);
		byAlso.set(key, names);
	}
	return names;
}
