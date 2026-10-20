// the commands with an argument code reads by its role, and their calls in a text: the reading most files that define
// the name give
import commandsIndex from '../data/commands.json';
import { FILE_ROLES, type Argument, type CiteForm, type Role } from '../types';
import { envNameAlternation } from '../environments/envFacts';

export type CommandReading = { name: string; args: Argument[]; repeat?: Argument[]; cite?: CiteForm };

/** one item of an argument; `at` is where it starts in the text */
export type ArgumentValue = { value: string; at: number };

/** `index` counts on past `args` into the repeated arguments; `from` and `to` bound the text inside the delimiters */
export type CallArgument = { index: number; arg: Argument; from: number; to: number; values: ArgumentValue[] };

export type CommandCall = { command: string; at: number; end: number; args: CallArgument[] };

/** how one command reads its arguments, keyed by name in a reading table */
export type CommandReadings = Record<string, Omit<CommandReading, 'name'>>;

export type IndexReading = Omit<CommandReading, 'name'>;

const INDEX = (commandsIndex as { commands: Record<string, IndexReading> }).commands;
// the environments whose arguments the common reading holds (restatable defines the macro it is given)
const ENVIRONMENTS = (commandsIndex as unknown as { environments: Record<string, { args: Argument[] }> }).environments;

/** a role an argument holds, or `derives` for an argument that creates other names from its value */
export type ArgumentRole = Role | 'derives';

export function rolesOf(arg: Argument): Role[] {
	return arg.role === undefined ? [] : [arg.role].flat();
}

export function commonCommand(name: string): CommandReading | null {
	const entry = INDEX[name];
	return entry ? { name, ...entry } : null;
}

function holds(reading: { args: Argument[]; repeat?: Argument[] }, roles: readonly ArgumentRole[]): boolean {
	return [...reading.args, ...(reading.repeat ?? [])].some(
		(a) => (a.derives !== undefined && roles.includes('derives')) || rolesOf(a).some((r) => roles.includes(r))
	);
}

/** the commands with an argument of one of `roles`, longest name first */
export function commandNames(roles: readonly ArgumentRole[]): string[] {
	return Object.keys(INDEX)
		.filter((n) => holds(INDEX[n], roles))
		.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

/** the commands whose first braced argument is typeset in `mode`, longest name first */
export function commandsOpeningMode(mode: NonNullable<Argument['mode']>): string[] {
	return Object.keys(INDEX)
		.filter((n) => INDEX[n].args.find((a) => a.kind === 'm')?.mode === mode)
		.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

const SPACE = /\s/;

function skipSpace(text: string, from: number): number {
	let i = from;
	while (i < text.length && SPACE.test(text[i])) i++;
	return i;
}

let braces: { text: string; closes: Int32Array } | null = null;

/** where each { of `text` closes, -1 when it never does; one pass per text, so unclosed groups cost nothing more */
function braceCloses(text: string): Int32Array {
	if (braces?.text === text) return braces.closes;
	const closes = new Int32Array(text.length).fill(-1);
	const open: number[] = [];
	for (let j = 0; j < text.length; j++) {
		const c = text[j];
		if (c === '\\') j++;
		else if (c === '{') open.push(j);
		else if (c === '}' && open.length) closes[open.pop()!] = j;
	}
	braces = { text, closes };
	return closes;
}

// an optional argument longer than this is a stray bracket
const LONGEST_DELIMITED = 10_000;

/** the index just past the group that opens at `i` and closes with `close`, braces nested; -1 when it never closes */
function groupEnd(text: string, i: number, open: string, close: string): number {
	const closes = braceCloses(text);
	if (open === '{') return closes[i] < 0 ? -1 : closes[i] + 1;
	let depth = 1;
	for (let j = i + 1; j < text.length && j - i < LONGEST_DELIMITED; j++) {
		const c = text[j];
		if (c === '\\') j++;
		else if (c === '{') {
			if (closes[j] < 0) return -1;
			j = closes[j];
		} else if (c === '}') return -1;
		else if (c === close) {
			if (--depth === 0) return j + 1;
		} else if (c === open) depth++;
	}
	return -1;
}

/** the items one argument holds: a comma list split, a list of {groups} (\graphicspath) unwrapped */
function valuesIn(arg: Argument, text: string, from: number, to: number): ArgumentValue[] {
	const inner = text.slice(from, to);
	const out: ArgumentValue[] = [];
	function push(raw: string, at: number) {
		const lead = raw.length - raw.trimStart().length;
		// TeX reads a line break inside a name as a space
		const value = raw.trim().replace(/\s+/g, ' ');
		if (value) out.push({ value, at: at + lead });
	}
	if (arg.list && /^\s*\{/.test(inner)) {
		for (const m of inner.matchAll(/\{([^{}]*)\}/g)) push(m[1], from + (m.index ?? 0) + 1);
	} else if (arg.list) {
		let at = from;
		for (const part of inner.split(',')) {
			push(part, at);
			at += part.length + 1;
		}
	} else push(inner, from);
	return out;
}

type ArgSpan = { from: number; to: number; end: number };

/** where the argument of `kind` that may start at `start` holds its text; 'absent' for an optional one left out, null
 * when the call stops being readable */
function spanAt(text: string, start: number, kind: string, takes: 'name' | 'token' | null, spaced: boolean): ArgSpan | 'absent' | null {
	const c = text[start];
	if (kind === 's' || kind[0] === 't') {
		const mark = kind === 's' ? '*' : kind[1];
		return c === mark ? { from: start, to: start, end: start + 1 } : 'absent';
	}
	if (kind === 'o' || kind[0] === 'd') {
		const [open, close] = kind === 'o' ? ['[', ']'] : [kind[1], kind[2]];
		if (c !== open) return 'absent';
		const end = groupEnd(text, start, open, close);
		return end < 0 ? null : { from: start + 1, to: end - 1, end };
	}
	if (kind === 'm' || kind === 'g' || kind[0] === 'r') {
		const [open, close] = kind[0] === 'r' ? [kind[1], kind[2]] : ['{', '}'];
		if (c === open) {
			const end = groupEnd(text, start, open, close);
			return end < 0 ? null : { from: start + 1, to: end - 1, end };
		}
		if (kind === 'g') return 'absent';
		// \input name: TeX's own file name syntax, up to a space; \input right after the name is still the command's name
		if (kind === 'm' && takes === 'name' && spaced && c !== undefined && c !== '\\' && c !== '}') {
			let end = start;
			while (end < text.length && !/[\s{}%\\]/.test(text[end])) end++;
			return { from: start, to: end, end };
		}
		// \newcommand\foo: one token
		if (kind === 'm' && takes === 'token' && c === '\\') {
			let end = start + 1;
			if (/[A-Za-z@]/.test(text[end] ?? '')) while (end < text.length && /[A-Za-z@]/.test(text[end])) end++;
			else end++;
			return { from: start, to: end, end };
		}
	}
	return null;
}

function readArg(text: string, at: number, arg: Argument, index: number, out: CallArgument[]): number | 'absent' | null {
	const roles = rolesOf(arg);
	const takes = roles.some((r) => (FILE_ROLES as Role[]).includes(r)) ? 'name' : roles.includes('macro') ? 'token' : null;
	const start = skipSpace(text, at);
	const span = spanAt(text, start, arg.kind.replace(/^!/, ''), takes, start > at);
	if (span === null || span === 'absent') return span;
	out.push({ index, arg, from: span.from, to: span.to, values: valuesIn(arg, text, span.from, span.to) });
	return span.end;
}

/** reads the call's arguments by their kinds from `from`, just past the command name, then the repeated ones while
 * the next token opens one */
function readArgs(text: string, from: number, reading: IndexReading): { end: number; args: CallArgument[] } {
	const out: CallArgument[] = [];
	let at = from;
	for (let index = 0; index < reading.args.length; index++) {
		const end = readArg(text, at, reading.args[index], index, out);
		if (end === null) return { end: at, args: out };
		if (end !== 'absent') at = end;
	}
	const repeat = reading.repeat ?? [];
	function opens(c: string | undefined): boolean {
		return repeat.some((a) => (a.kind === 'o' ? '[' : a.kind[0] === 'm' ? '{' : a.kind[1]) === c);
	}
	for (let round = 0; repeat.length && opens(text[skipSpace(text, at)]); round++) {
		const before = out.length;
		let next = at;
		for (let i = 0; i < repeat.length; i++) {
			const end = readArg(text, next, repeat[i], reading.args.length + round * repeat.length + i, out);
			if (end === null) break;
			if (end !== 'absent') next = end;
		}
		if (out.length === before || !out.slice(before).some((a) => /^[mr]/.test(a.arg.kind))) {
			out.length = before;
			break;
		}
		at = next;
	}
	return { end: at, args: out };
}

/** just past the arguments `args` write from `from` */
export function argumentsEnd(text: string, from: number, args: Argument[]): number {
	return readArgs(text, from, { args }).end;
}

/** a backslash at `i` that a backslash before it escapes (\\input is a line break, then text) */
function escaped(text: string, i: number): boolean {
	let n = 0;
	while (i - n > 0 && text[i - n - 1] === '\\') n++;
	return n % 2 === 1;
}

const patterns = new Map<string, RegExp>();

function patternOf(names: string[]): RegExp {
	return names.length ? new RegExp(`\\\\(${names.join('|')})(?![A-Za-z@])`, 'g') : /(?!)/g;
}

function callsBy(text: string, pattern: RegExp, readings: CommandReadings): CommandCall[] {
	const out: CommandCall[] = [];
	for (const m of text.matchAll(pattern)) {
		if (escaped(text, m.index)) continue;
		const { end, args } = readArgs(text, m.index + m[0].length, readings[m[1]]);
		out.push({ command: m[1], at: m.index, end, args });
	}
	return out;
}

/** every call in `text` of a command with an argument of one of `roles`, nested ones too, with all the arguments it
 * writes; `own` holds the document's own commands, read over the data's; comments are the caller's to mask */
export function callsIn(text: string, roles: readonly ArgumentRole[], own?: CommandReadings): CommandCall[] {
	const key = roles.join(',');
	let pattern = patterns.get(key);
	if (!pattern) {
		pattern = patternOf(commandNames(roles));
		patterns.set(key, pattern);
	}
	const readings = own ?? {};
	const mine = Object.keys(readings).filter((n) => holds(readings[n], roles));
	if (!mine.length) return callsBy(text, pattern, INDEX);
	const theirs = callsBy(text, pattern, INDEX).filter((c) => !mine.includes(c.command));
	const ours = callsBy(text, patternOf(mine.sort((a, b) => b.length - a.length)), readings);
	return [...theirs, ...ours].sort((a, b) => a.at - b.at);
}

const environmentPatterns = new Map<string, RegExp>();

/** the `\begin{name}` calls of the environments with an argument of one of `roles`, with the arguments they write;
 * `command` is `begin{name}` */
export function environmentCallsIn(text: string, roles: readonly ArgumentRole[]): CommandCall[] {
	const key = roles.join(',');
	let pattern = environmentPatterns.get(key);
	if (!pattern) {
		const names = Object.keys(ENVIRONMENTS)
			.filter((n) => holds(ENVIRONMENTS[n], roles))
			.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
		pattern = names.length ? new RegExp(`\\\\begin\\s*\\{(${envNameAlternation(names)})\\}`, 'g') : /(?!)/g;
		environmentPatterns.set(key, pattern);
	}
	if (!text.includes('\\begin')) return [];
	const out: CommandCall[] = [];
	for (const m of text.matchAll(pattern)) {
		if (escaped(text, m.index)) continue;
		const { end, args } = readArgs(text, m.index + m[0].length, ENVIRONMENTS[m[1]]);
		out.push({ command: `begin{${m[1]}}`, at: m.index, end, args });
	}
	return out;
}

const NAME_AT = /\\([A-Za-z@]+)/y;

/** the call of an indexed command whose backslash is at `at`, with every argument it writes; null for any other name */
export function callAt(text: string, at: number): CommandCall | null {
	NAME_AT.lastIndex = at;
	const name = NAME_AT.exec(text)?.[1];
	if (!name || !Object.hasOwn(INDEX, name) || escaped(text, at)) return null;
	const { end, args } = readArgs(text, at + 1 + name.length, INDEX[name]);
	return { command: name, at, end, args };
}

const CURSOR = '\u0001';

export type OpenArgument = { call: CommandCall; arg: CallArgument; value: ArgumentValue };

/** the argument of one of `roles` that `before` (the text up to the cursor) leaves open, and the item the cursor is in */
export function argumentAt(before: string, roles: readonly Role[], own?: CommandReadings): OpenArgument | null {
	for (const closer of ['}', ']']) {
		const text = before + CURSOR + closer;
		const calls = [...callsIn(text, roles, own), ...environmentCallsIn(text, roles)].sort((x, y) => x.at - y.at);
		for (let c = calls.length - 1; c >= 0; c--) {
			const call = calls[c];
			for (const arg of call.args) {
				const value = arg.values.find((v) => v.value.endsWith(CURSOR));
				if (!value || !rolesOf(arg.arg).some((r) => roles.includes(r))) continue;
				return { call, arg, value: { value: value.value.slice(0, -1), at: value.at } };
			}
		}
	}
	return null;
}

/** a call the cursor is inside: the command, where it starts in the text given and the argument holding the cursor */
export type EnclosingCall = { command: string; at: number; reading: IndexReading; arg: CallArgument };

const LOOK_BACK = 2000;
const MAX_CANDIDATES = 40;
const NAME_BEFORE = /\\([A-Za-z@]+)/g;
// `\%` is a percent sign, `\\%` a line break and then a comment
const COMMENT = /(?<!\\)((?:\\\\)*)%[^\n]*/g;

// what ends the groups `text` leaves open, so a call cut at the cursor reads like a finished one
export function closersOf(text: string): string {
	const open: string[] = [];
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '\\') i++;
		else if (c === '{' || c === '[') open.push(c);
		else if (c === '}') {
			const group = open.lastIndexOf('{');
			if (group >= 0) open.length = group;
		} else if (c === ']' && open[open.length - 1] === '[') open.pop();
	}
	return open
		.reverse()
		.map((c) => (c === '{' ? '}' : ']'))
		.join('');
}

/** the calls whose arguments `before` (the text up to the cursor) leaves open, the innermost first; reads back at most
 * 2000 characters, and `at` is the command's offset in `before` */
export function enclosingCalls(before: string, readingOf: (name: string) => IndexReading | null): EnclosingCall[] {
	const text = before.slice(-LOOK_BACK).replace(COMMENT, (c, slashes: string) => slashes + ' '.repeat(c.length - slashes.length));
	const start = before.length - text.length;
	const names = [...text.matchAll(NAME_BEFORE)].filter((m) => !escaped(text, m.index)).slice(-MAX_CANDIDATES);
	const out: EnclosingCall[] = [];
	for (const m of names.reverse()) {
		const reading = readingOf(m[1]);
		if (!reading) continue;
		const call = text.slice(m.index);
		const cursor = call.length;
		const { args } = readArgs(call + CURSOR + closersOf(call), m[0].length, reading);
		const arg = args.find((a) => a.from <= cursor && cursor < a.to);
		if (arg) out.push({ command: m[1], at: start + m.index, reading, arg });
	}
	return out;
}

const ENVIRONMENT_BEFORE = /\\begin\{([A-Za-z@]+\*?)\}/g;

/** an environment whose `\begin{name}` arguments `before` leaves open; `command` is `begin{name}` and `at` the backslash */
export function enclosingEnvironment(before: string, argumentsOf: (name: string) => Argument[] | null): EnclosingCall | null {
	const text = before.slice(-LOOK_BACK).replace(COMMENT, (c, slashes: string) => slashes + ' '.repeat(c.length - slashes.length));
	const start = before.length - text.length;
	const begins = [...text.matchAll(ENVIRONMENT_BEFORE)].filter((m) => !escaped(text, m.index)).slice(-MAX_CANDIDATES);
	for (const m of begins.reverse()) {
		const args = argumentsOf(m[1]);
		if (!args?.length) continue;
		const rest = text.slice(m.index + m[0].length);
		const cursor = rest.length;
		const read = readArgs(rest + CURSOR + closersOf(rest), 0, { args });
		const arg = read.args.find((a) => a.from <= cursor && cursor < a.to);
		if (arg) return { command: `begin{${m[1]}}`, at: start + m.index, reading: { args }, arg };
	}
	return null;
}
