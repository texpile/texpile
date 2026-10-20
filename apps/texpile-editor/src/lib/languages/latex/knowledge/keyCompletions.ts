// key=value completion inside an argument, and package and class options
import { snippetCompletion, type Completion } from '@codemirror/autocomplete';
import { bracketsOf } from './entryForms';
import { fileIdOf, useNameOf } from './fileIds';
import { layersOf, type LoadedFile } from './loadedFiles';
import { stackedCommands, stackedEnvironments } from './stackedEntries';
import type { Argument, CommandEntry, EnvironmentEntry, Key } from './types';

/** a bracket group as typed: `[]`, `{}`, `()` or `<>` */
export type ArgGroup = string;

type Keyed = { macros: Record<string, string[]>; envs: Record<string, string[]> };
let keyed: Promise<Keyed> | null = null;
function keyedIndex(): Promise<Keyed> {
	keyed ??= import('./data/keyed.json').then((m) => m.default as unknown as Keyed);
	return keyed;
}

function keyOptions(key: Key): Completion[] {
	const out: Completion[] = [];
	if (key.bare || (!key.values && key.placeholder === undefined && !key.default)) out.push({ label: key.key, type: 'property' });
	for (const v of key.values ?? []) out.push({ label: `${key.key}=${v}`, type: 'property' });
	const label = `${key.key}=`;
	const hint = key.placeholder || key.values?.[0];
	if (key.placeholder !== undefined || key.values || key.default !== undefined)
		out.push(hint ? snippetCompletion(`${label}\${1:${hint}}`, { label, type: 'property' }) : { label, type: 'property' });
	return out;
}

function dedupe(options: Completion[]): Completion[] {
	const seen = new Set<string>();
	return options.filter((o) => !seen.has(o.label) && !!seen.add(o.label));
}

// a group's keys from every file that adds to it, its owner (the file its id names) first
async function groupKeys(group: string, loaded: LoadedFile[]): Promise<Key[]> {
	const owner = group.slice(0, group.indexOf('#'));
	const ownerLayers = loaded.some((f) => f.id === owner) ? [] : await layersOf(useNameOf(owner));
	return [...ownerLayers, ...loaded.flatMap((f) => f.layers)].flatMap((l) => l.keys?.[group] ?? []);
}

// read the way LaTeX reads arguments: a group the writer left out is skipped when it is optional, so
// \newtcolorbox{name}[1]{ reaches the options of [init]{name}[n][default]{options}; -1 when the typed groups do not fit
function typedArgument(args: Argument[], typed: ArgGroup[]): Argument | null {
	const groups = args.filter((a) => bracketsOf(a.kind));
	let at = -1;
	for (const t of typed) {
		at++;
		while (at < groups.length && bracketsOf(groups[at].kind) !== t && bracketsOf(groups[at].kind) !== '{}') at++;
		if (at >= groups.length || bracketsOf(groups[at].kind) !== t) return null;
	}
	return groups[at] ?? null;
}

async function keysOf(
	entry: CommandEntry | EnvironmentEntry | undefined,
	typed: ArgGroup[],
	loaded: LoadedFile[]
): Promise<Completion[] | null> {
	const arg = entry?.args && typedArgument(entry.args, typed);
	if (!arg) return null;
	const keys = (await Promise.all((arg.keys ?? []).map((g) => groupKeys(g, loaded)))).flat();
	const options = dedupe([...(arg.values ?? []).map((value) => ({ label: value, type: 'constant' })), ...keys.flatMap(keyOptions)]);
	return options.length ? options : null;
}

// a command the document does not load: the file with the most keys for it
async function fromIndex(kind: 'macros' | 'envs', name: string): Promise<LoadedFile[] | null> {
	const id = (await keyedIndex())[kind][name]?.[0];
	if (!id) return null;
	const n = useNameOf(id);
	return [{ id, name: n, layers: await layersOf(n), options: new Set() }];
}

/** keyval completions for the last of the groups typed after \name, the one being typed */
export async function keysForMacro(name: string, typed: ArgGroup[], loaded: LoadedFile[]): Promise<Completion[] | null> {
	const own = await keysOf(stackedCommands(loaded).get(name), typed, loaded);
	if (own) return own;
	const other = await fromIndex('macros', name);
	return other && keysOf(stackedCommands(other).get(name), typed, other);
}

/** keyval completions for the last of the groups typed after \begin{env}, the one being typed */
export async function keysForEnv(env: string, typed: ArgGroup[], loaded: LoadedFile[]): Promise<Completion[] | null> {
	const own = await keysOf(stackedEnvironments(loaded).get(env), typed, loaded);
	if (own) return own;
	const other = await fromIndex('envs', env);
	return other && keysOf(stackedEnvironments(other).get(env), typed, other);
}

/** \usepackage[...] and \documentclass[...] option lists, merged across the named packages (class-<name> for a class);
 * a file that hands the options it does not know to another (revtex to article) offers that file's too */
export async function packageOptions(names: string[]): Promise<Completion[] | null> {
	const keys: Key[] = [];
	const seen = new Set<string>();
	const queue = [...names];
	while (queue.length) {
		const name = queue.shift()!;
		if (seen.has(name)) continue;
		seen.add(name);
		for (const layer of await layersOf(name)) {
			keys.push(...(layer.keys?.[`${fileIdOf(name)}#options`] ?? []));
			queue.push(...(layer.passOptions ?? []).map(useNameOf));
		}
	}
	return keys.length ? dedupe(keys.flatMap(keyOptions)) : null;
}
