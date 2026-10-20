// how the loaded files' commands read their arguments, for the roles the index of common commands leaves out (the
// glossaries commands, which a package other than the one loaded defines differently)
import type { LoadedFile } from '../loadedFiles';
import { stackedCommands } from '../stackedEntries';
import { commonCommand, rolesOf, type CommandReadings, type IndexReading } from './commandCalls';
import type { Role } from '../types';

const cache = new WeakMap<LoadedFile[], Map<string, CommandReadings>>();

/** the readings of the loaded files' commands with an argument of one of `roles`, to pass as the `own` readings of a call search */
export function loadedReadings(loaded: LoadedFile[], roles: readonly Role[]): CommandReadings {
	const key = roles.join(',');
	let byRoles = cache.get(loaded);
	if (!byRoles) cache.set(loaded, (byRoles = new Map()));
	let out = byRoles.get(key);
	if (!out) {
		out = {};
		for (const [name, entry] of stackedCommands(loaded)) {
			const args = entry.args ?? [];
			const repeat = entry.repeat ?? [];
			if ([...args, ...repeat].some((a) => rolesOf(a).some((r) => roles.includes(r))))
				out[name] = { args, ...(repeat.length ? { repeat } : {}) };
		}
		byRoles.set(key, out);
	}
	return out;
}

/** how the loaded files' entry for `name` reads its arguments, null when none states them */
export function loadedReading(loaded: LoadedFile[] | null, name: string): IndexReading | null {
	const entry = loaded && stackedCommands(loaded).get(name);
	return entry?.args ? { args: entry.args, ...(entry.repeat?.length ? { repeat: entry.repeat } : {}) } : null;
}

/** how `name` reads its arguments: the loaded files' entry when it states them, else the common reading */
export function readingIn(loaded: LoadedFile[] | null, name: string): IndexReading | null {
	return loadedReading(loaded, name) ?? commonCommand(name);
}
