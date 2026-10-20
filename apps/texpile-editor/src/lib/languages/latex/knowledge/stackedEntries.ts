// the commands and environments a set of loaded files defines: entries of one name stack in load order (rule 4)
import { conditionHolds, type LoadedFile } from './loadedFiles';
import type { CommandEntry, EnvironmentEntry } from './types';

/** from: the file whose entry set it last; offered: some loaded file's own entry is not hidden (completion offers the
 * union, since a package can stop another from loading, xkeyval keeping keyval's \setkeys out, which file order
 * cannot show); starred: some loaded file gives it a star */
type Stacked = { from: string; offered: boolean; starred: boolean };
export type StackedCommand = CommandEntry & Stacked;
export type StackedEnvironment = EnvironmentEntry & Stacked;

function withoutNulls<T extends object>(entry: T): T {
	return Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== null)) as T;
}

type Stackable = { name: string; if?: string; remove?: true; alias?: string; hidden?: true | null; args?: { kind: string }[] | null };

// a file that lists a command again with the same arguments keeps what a file below said of each (amsart's \newtheorem,
// revtex's \url); other arguments replace the list whole
function stackedArgs(below: { kind: string }[] | null | undefined, own: { kind: string }[] | null | undefined) {
	if (!below || !own || below.length !== own.length || below.some((a, i) => a.kind !== own[i].kind)) return own;
	return own.map((a, i) => withoutNulls({ ...below[i], ...a }));
}

function stack<T extends Stackable>(
	loaded: LoadedFile[],
	listOf: (file: LoadedFile['layers'][number]) => T[] | undefined
): Map<string, T & Stacked> {
	const out = new Map<string, T & Stacked>();
	for (const file of loaded)
		for (const layer of file.layers)
			for (const e of listOf(layer) ?? []) {
				if (e.if && !conditionHolds(e.if, file.options)) continue;
				if (e.remove) {
					out.delete(e.name);
					continue;
				}
				// an alias is a copy of its target as it stands when the alias is reached
				const below = e.alias ? out.get(e.alias) : out.get(e.name);
				const offered = !!out.get(e.name)?.offered || !e.hidden;
				const starred = !!out.get(e.name)?.starred || e.args?.[0]?.kind === 's';
				const args = 'args' in e ? { args: stackedArgs(below?.args, e.args) } : {};
				const merged = withoutNulls({ ...below, ...e, ...args, name: e.name, from: file.id, offered, starred });
				delete merged.if;
				delete merged.alias;
				out.set(e.name, merged);
			}
	return out;
}

const commandCache = new WeakMap<LoadedFile[], Map<string, StackedCommand>>();
const environmentCache = new WeakMap<LoadedFile[], Map<string, StackedEnvironment>>();

export function stackedCommands(loaded: LoadedFile[]): Map<string, StackedCommand> {
	let out = commandCache.get(loaded);
	if (!out) {
		out = stack(loaded, (l) => l.macros);
		commandCache.set(loaded, out);
	}
	return out;
}

/** a starred twin is listed under its own name, with its differences applied */
export function stackedEnvironments(loaded: LoadedFile[]): Map<string, StackedEnvironment> {
	let out = environmentCache.get(loaded);
	if (!out) {
		out = new Map();
		for (const [name, e] of stack(loaded, (l) => l.envs)) {
			const { star, ...plain } = e;
			out.set(name, plain);
			if (star) out.set(`${name}*`, withoutNulls({ ...plain, ...star, name: `${name}*` }));
		}
		environmentCache.set(loaded, out);
	}
	return out;
}
