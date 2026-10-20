import type { LoadedFile } from '../../../knowledge/loadedFiles';
import { stackedCommands, stackedEnvironments } from '../../../knowledge/stackedEntries';

const known = new WeakMap<LoadedFile[], Set<string>>();

// one namespace, since environment X is the command \X
export function knownNames(loaded: LoadedFile[]): Set<string> {
	let names = known.get(loaded);
	if (!names) {
		names = new Set([...stackedCommands(loaded).keys(), ...stackedEnvironments(loaded).keys()].map((n) => n.replace(/\*$/, '')));
		for (const f of loaded)
			for (const layer of f.layers) {
				for (const c of layer.provides?.counters ?? []) names.add(`the${c.name}`);
				for (const fl of layer.provides?.floats ?? []) if (fl.list) names.add(fl.list);
			}
		known.set(loaded, names);
	}
	return names;
}
