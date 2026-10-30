// the commands with an argument code reads by its role, and their calls in a text: the reading most files that define
// the name give
import commandsIndex from '../data/commands.json';
import { FILE_ROLES, type Argument, type CiteForm, type Role } from '../types';
import { blankComments } from '../../texCode';
import { commandTokensOf } from '../../syntax/commandTokens';
import { latexTreeOf } from '../../syntax/latexTrees';

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

// an optional argument longer than this is a stray bracket
const LONGEST_DELIMITED = 10_000;

/** the index just past the group that opens at `i` and closes with `close`, braces nested; -1 when it never closes */
function groupEnd(text: string, i: number, open: string, close: string): number {
	const closes = commandTokensOf(text).closes;
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

const UNREAD = '\u0000';

// a comment, its line break and the next line's indent, which TeX never reads, as UNREAD of the same length
function withoutComments(text: string, from: number, to: number): string {
	let inner = text.slice(from, to);
	if (!inner.includes('%')) return inner;
	latexTreeOf(text).iterate({
		from,
		to,
		enter(n) {
			if (n.name !== 'Comment') return;
			const end = Math.min(to, n.to + (/^\r?\n[ \t]*/.exec(text.slice(n.to, to))?.[0].length ?? 0));
			const start = Math.max(from, n.from);
			inner = inner.slice(0, start - from) + UNREAD.repeat(end - start) + inner.slice(end - from);
		}
	});
	return inner;
}

/** the items one argument holds: a comma list split, a list of {groups} (\graphicspath) unwrapped */
function valuesIn(arg: Argument, text: string, from: number, to: number): ArgumentValue[] {
	const inner = withoutComments(text, from, to);
	const out: ArgumentValue[] = [];
	function push(raw: string, at: number) {
		let lead = 0;
		while (lead < raw.length && (raw[lead] === UNREAD || /\s/.test(raw[lead]))) lead++;
		// TeX reads a line break inside a name as a space
		const value = raw.replaceAll(UNREAD, '').trim().replace(/\s+/g, ' ');
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
export function readArgs(text: string, from: number, reading: IndexReading): { end: number; args: CallArgument[] } {
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

const nameSets = new Map<string, Set<string>>();

function namesFor(roles: readonly ArgumentRole[]): Set<string> {
	const key = roles.join(',');
	let names = nameSets.get(key);
	if (!names) {
		names = new Set(commandNames(roles));
		nameSets.set(key, names);
	}
	return names;
}

type CommandToken = ReturnType<typeof commandTokensOf>['list'][number];

function callsBy(text: string, tokens: CommandToken[], names: ReadonlySet<string>, readings: CommandReadings): CommandCall[] {
	const out: CommandCall[] = [];
	for (const token of tokens) {
		if (!names.has(token.name)) continue;
		const { end, args } = readArgs(text, token.end, readings[token.name]);
		out.push({ command: token.name, at: token.at, end, args });
	}
	return out;
}

function callsOver(text: string, tokens: CommandToken[], roles: readonly ArgumentRole[], own?: CommandReadings): CommandCall[] {
	const names = namesFor(roles);
	const readings = own ?? {};
	const mine = new Set(Object.keys(readings).filter((n) => holds(readings[n], roles)));
	if (!mine.size) return callsBy(text, tokens, names, INDEX);
	const theirs = callsBy(text, tokens, names, INDEX).filter((c) => !mine.has(c.command));
	return [...theirs, ...callsBy(text, tokens, mine, readings)].sort((a, b) => a.at - b.at);
}

/** every call in `text` of a command with an argument of one of `roles`, nested ones too, with all the arguments it
 * writes; `own` holds the document's own commands, read over the data's; comments are the caller's to mask */
export function callsIn(text: string, roles: readonly ArgumentRole[], own?: CommandReadings): CommandCall[] {
	return callsOver(text, commandTokensOf(text).list, roles, own);
}

// an enclosing call may have commands in its arguments, so a few before the position are tried
const COMMANDS_BEFORE = 24;

export function callsNear(text: string, pos: number, roles: readonly ArgumentRole[], own?: CommandReadings): CommandCall[] {
	const list = commandTokensOf(text).list;
	let high = list.length;
	for (let low = 0; low < high;) {
		const mid = (low + high) >> 1;
		if (list[mid].at <= pos) low = mid + 1;
		else high = mid;
	}
	return callsOver(text, list.slice(Math.max(0, high - COMMANDS_BEFORE), high), roles, own).filter((c) => pos <= c.end);
}

const environmentNameSets = new Map<string, Set<string>>();

/** the `\begin{name}` calls of the environments with an argument of one of `roles`, with the arguments they write;
 * `command` is `begin{name}` */
export function environmentCallsIn(text: string, roles: readonly ArgumentRole[]): CommandCall[] {
	const key = roles.join(',');
	let names = environmentNameSets.get(key);
	if (!names) {
		names = new Set(Object.keys(ENVIRONMENTS).filter((n) => holds(ENVIRONMENTS[n], roles)));
		environmentNameSets.set(key, names);
	}
	if (!text.includes('\\begin')) return [];
	const out: CommandCall[] = [];
	for (const begin of commandTokensOf(text).begins) {
		if (!names.has(begin.name)) continue;
		const { end, args } = readArgs(text, begin.end, ENVIRONMENTS[begin.name]);
		out.push({ command: `begin{${begin.name}}`, at: begin.at, end, args });
	}
	return out;
}

/** the call of an indexed command whose backslash is at `at`, with every argument it writes; null for any other name */
export function callAt(text: string, at: number): CommandCall | null {
	const name = commandTokensOf(text).byOffset.get(at);
	if (!name || !Object.hasOwn(INDEX, name)) return null;
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

/** the argument of the call written in `call`, cut at the cursor, that holds the cursor; `from` is just past its name */
export function argumentHolding(call: string, from: number, reading: IndexReading): CallArgument | null {
	const text = blankComments(call);
	const cursor = text.length;
	return readArgs(text + CURSOR + closersOf(text), from, reading).args.find((a) => a.from <= cursor && cursor < a.to) ?? null;
}

/** the calls whose arguments `before` (the text up to the cursor) leaves open, the innermost first; reads back at most
 * 2000 characters, and `at` is the command's offset in `before` */
export function enclosingCalls(before: string, readingOf: (name: string) => IndexReading | null): EnclosingCall[] {
	const text = blankComments(before.slice(-LOOK_BACK));
	const start = before.length - text.length;
	const names = commandTokensOf(text).list.slice(-MAX_CANDIDATES);
	const out: EnclosingCall[] = [];
	for (const token of names.reverse()) {
		const reading = readingOf(token.name);
		if (!reading) continue;
		const arg = argumentHolding(text.slice(token.at), token.end - token.at, reading);
		if (arg) out.push({ command: token.name, at: start + token.at, reading, arg });
	}
	return out;
}

/** an environment whose `\begin{name}` arguments `before` leaves open; `command` is `begin{name}` and `at` the backslash */
export function enclosingEnvironment(before: string, argumentsOf: (name: string) => Argument[] | null): EnclosingCall | null {
	const text = blankComments(before.slice(-LOOK_BACK));
	const start = before.length - text.length;
	const begins = commandTokensOf(text).begins.slice(-MAX_CANDIDATES);
	for (const begin of begins.reverse()) {
		const args = argumentsOf(begin.name);
		if (!args?.length) continue;
		const arg = argumentHolding(text.slice(begin.end), 0, { args });
		if (arg) return { command: `begin{${begin.name}}`, at: start + begin.at, reading: { args }, arg };
	}
	return null;
}
