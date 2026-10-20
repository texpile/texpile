import { useNameOf } from '../../../knowledge/fileIds';
import { conditionHolds, type LoadedFile } from '../../../knowledge/loadedFiles';
import type { Engine } from '$lib/workspace/compileCommand';

const closures = new WeakMap<LoadedFile[], Map<string, Set<string>>>();

/** each loaded file with everything it loads in turn, by name */
export function loadClosures(loaded: LoadedFile[], engine: Engine | null): Map<string, Set<string>> {
	let known = closures.get(loaded);
	if (known) return known;
	known = new Map();
	const byName = new Map(loaded.map((f) => [f.name, f]));
	function close(name: string, into: Set<string>): void {
		if (into.has(name)) return;
		into.add(name);
		const file = byName.get(name);
		if (!file) return;
		const deps = file.layers.reduce<NonNullable<LoadedFile['layers'][number]['deps']>>((all, l) => l.deps ?? all, []);
		for (const d of deps) {
			if ((!d.if || conditionHolds(d.if, file.options)) && (!d.engines || (engine !== null && d.engines.includes(engine)))) {
				close(useNameOf(d.id), into);
			}
		}
	}
	for (const f of loaded) {
		const all = new Set<string>();
		close(f.name, all);
		known.set(f.name, all);
	}
	closures.set(loaded, known);
	return known;
}
