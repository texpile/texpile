// the names a text writes as the value of a key (listings' \begin{lstlisting}[label=name], glossaries' parent=name), in the
// calls of the loaded files whose keys have that role
import { callsIn, rolesOf, type CommandReadings } from './commandCalls';
import { stackedCommands, stackedEnvironments } from '../stackedEntries';
import type { LoadedFile } from '../loadedFiles';
import type { Argument, Role } from '../types';

type KeyedReading = { args: Argument[]; keys: Set<string> };

/** `label` keys define a label (label=); `glossary` keys use an entry (parent=) */
export type KeyedRole = 'label' | 'glossary';

const readingsByLoaded = new WeakMap<
	LoadedFile[],
	Map<KeyedRole, { commands: Map<string, KeyedReading>; environments: Map<string, KeyedReading> }>
>();

// the keys of the groups an argument names that have the role
function keysOfRole(arg: Argument, loaded: LoadedFile[], role: KeyedRole): string[] {
	const groups = new Set(arg.keys ?? []);
	return loaded.flatMap((f) =>
		f.layers.flatMap((l) =>
			[...groups].flatMap((g) =>
				(l.keys?.[g] ?? []).filter((k) => k.role === (role as Role) && !!k.defines === (role === 'label')).map((k) => k.key)
			)
		)
	);
}

function keyedReadings(
	entries: Map<string, { args?: Argument[] | null }>,
	loaded: LoadedFile[],
	role: KeyedRole
): Map<string, KeyedReading> {
	const out = new Map<string, KeyedReading>();
	for (const [name, entry] of entries) {
		const keys = new Set<string>();
		const args = (entry.args ?? []).map((arg) => {
			const own = keysOfRole(arg, loaded, role);
			own.forEach((k) => keys.add(k));
			return own.length ? { ...arg, role: 'options' as const } : { kind: arg.kind };
		});
		if (keys.size) out.set(name, { args, keys });
	}
	return out;
}

function readingsOf(loaded: LoadedFile[], role: KeyedRole) {
	let byRole = readingsByLoaded.get(loaded);
	if (!byRole) readingsByLoaded.set(loaded, (byRole = new Map()));
	let out = byRole.get(role);
	if (!out) {
		out = {
			commands: keyedReadings(stackedCommands(loaded), loaded, role),
			environments: keyedReadings(stackedEnvironments(loaded), loaded, role)
		};
		byRole.set(role, out);
	}
	return out;
}

/** a value of a key; `at` is where it starts in the options text */
export type KeyValue = { value: string; at: number };

/** the values of the keys at the options' own level: [a=1, label={x,y}] has two for label */
export function keyValueSpansIn(options: string, keys: Set<string>): KeyValue[] {
	const out: KeyValue[] = [];
	let depth = 0;
	let start = 0;
	function take(end: number): void {
		const item = options.slice(start, end);
		const eq = item.indexOf('=');
		if (eq < 0 || !keys.has(item.slice(0, eq).trim())) return;
		let from = start + eq + 1;
		let to = end;
		while (from < to && /\s/.test(options[from])) from++;
		while (to > from && /\s/.test(options[to - 1])) to--;
		if (options[from] === '{' && options[to - 1] === '}' && to - from >= 2) {
			from++;
			to--;
			while (from < to && /\s/.test(options[from])) from++;
			while (to > from && /\s/.test(options[to - 1])) to--;
		}
		if (to > from) out.push({ value: options.slice(from, to), at: from });
	}
	for (let i = 0; i < options.length; i++) {
		const c = options[i];
		if (c === '\\') i++;
		else if (c === '{') depth++;
		else if (c === '}') depth--;
		else if (c === ',' && depth === 0) {
			take(i);
			start = i + 1;
		}
	}
	take(options.length);
	return out;
}

// the items of a key list at its own level: [a=1, label={x,y}] has two
export function keyValuesIn(options: string, keys: Set<string>): string[] {
	return keyValueSpansIn(options, keys).map((v) => v.value);
}

function valuesInCalls(text: string, readings: Map<string, KeyedReading>): KeyValue[] {
	const own: CommandReadings = Object.fromEntries([...readings].map(([name, r]) => [name, { args: r.args }]));
	return callsIn(text, ['options'], own)
		.filter((call) => readings.has(call.command))
		.flatMap((call) =>
			call.args
				.filter((a) => rolesOf(a.arg).includes('options'))
				.flatMap((a) =>
					keyValueSpansIn(text.slice(a.from, a.to), readings.get(call.command)!.keys).map((v) => ({ ...v, at: a.from + v.at }))
				)
		);
}

const BEGIN = /\\begin\s*\{([^{}]+)\}/g;

/** the values `text` (comments masked) gives the keys of `role`, in the commands and environments of the loaded files */
export function keyValuesOfRole(text: string, loaded: LoadedFile[], role: KeyedRole): KeyValue[] {
	if (!text.includes('=')) return [];
	const { commands, environments } = readingsOf(loaded, role);
	const out = valuesInCalls(text, commands);
	for (const m of text.matchAll(BEGIN)) {
		const reading = environments.get(m[1].trim());
		const from = m.index + m[0].length;
		const rest = text.slice(from, from + 2000);
		const head = '\\ENV';
		if (reading) out.push(...valuesInCalls(head + rest, new Map([['ENV', reading]])).map((v) => ({ ...v, at: v.at - head.length + from })));
	}
	return out;
}

/** the labels `text` (comments masked) defines with a key, in the commands and environments of the loaded files */
export function keyLabelsIn(text: string, loaded: LoadedFile[]): string[] {
	return keyValuesOfRole(text, loaded, 'label').map((v) => v.value);
}
