// what a text defines with the definers the package data knows (\newcommand, \NewDocumentCommand, \newtheorem, …);
// \def and \let are TeX's own syntax and stay with the parser
import { callsIn, environmentCallsIn, rolesOf, type CallArgument, type CommandCall } from './commandCalls';
import type { Argument, Role } from '../types';

export type DefinedKind = Extract<Role, 'macro' | 'environment' | 'counter'>;

export type Definition = {
	/** without the backslash */
	name: string;
	kind: DefinedKind;
	defines: NonNullable<Argument['defines']>;
	/** what the defined command or environment takes */
	args: Argument[];
	in?: 'math' | 'text';
	/** the body, or an environment's begin code */
	body?: string;
	end?: string;
	command: string;
	/** where the call starts, and where the defined name is written */
	at: number;
	nameAt: number;
};

const DEFINED: DefinedKind[] = ['macro', 'environment', 'counter'];

/** an xparse argument spec as arguments; the processors (>{…}, =, +, !) say nothing of the call's shape */
export function argumentsOfSpec(spec: string): Argument[] {
	const out: Argument[] = [];
	let i = 0;
	function group(): string {
		if (spec[i] !== '{') return spec[i++] ?? '';
		let depth = 0;
		const start = i;
		do {
			if (spec[i] === '{') depth++;
			else if (spec[i] === '}') depth--;
			i++;
		} while (depth > 0 && i < spec.length);
		return spec.slice(start + 1, i - 1);
	}
	while (i < spec.length) {
		const c = spec[i++];
		if (c === '>' || c === '=') group();
		else if (c === 'm' || c === 'o' || c === 's' || c === 'v' || c === 'b') out.push({ kind: c });
		else if (c === 'O' || c === 'G') {
			const value = group();
			out.push({ kind: c === 'O' ? 'o' : 'g', default: value });
		} else if (c === 'r' || c === 'd') out.push({ kind: `${c}${group()}${group()}` });
		else if (c === 'R' || c === 'D') {
			const delimiters = `${group()}${group()}`;
			out.push({ kind: `${c.toLowerCase()}${delimiters}`, default: group() });
		} else if (c === 't') out.push({ kind: `t${group()}` });
		else if (c === 'e' || c === 'E') {
			out.push({ kind: `e{${group()}}` });
			if (c === 'E') group();
		}
	}
	return out;
}

function argOf(call: CommandCall, role: Role): CallArgument | undefined {
	return call.args.find((a) => rolesOf(a.arg).includes(role));
}

function textOf(text: string, a: CallArgument | undefined): string | undefined {
	return a ? text.slice(a.from, a.to) : undefined;
}

function signatureOf(text: string, call: CommandCall, makes: Argument['makes']): Argument[] {
	const spec = textOf(text, argOf(call, 'spec'));
	if (spec !== undefined) return argumentsOfSpec(spec);
	const arity = Number(textOf(text, argOf(call, 'arity'))?.trim() || 0);
	const fallback = argOf(call, 'default');
	const params: Argument[] = Array.from({ length: Number.isFinite(arity) ? arity : 0 }, () => ({ kind: 'm' }));
	if (fallback && params.length) params[0] = { kind: 'o', default: textOf(text, fallback) };
	return [...(makes?.args ?? []), ...params];
}

/** the calls of the definers in `text`, for definitionsIn when the caller needs them too */
export function definerCallsIn(text: string): CommandCall[] {
	return callsIn(text, DEFINED);
}

/** every definition `text` makes, in source order; comments are the caller's to mask */
export function definitionsIn(text: string, calls: CommandCall[] = definerCallsIn(text)): Definition[] {
	const out: Definition[] = [];
	for (const call of calls) {
		for (const named of call.args) {
			const kind = DEFINED.find((r) => rolesOf(named.arg).includes(r));
			if (!kind || !named.arg.defines) continue;
			const args = signatureOf(text, call, named.arg.makes);
			const body = textOf(text, argOf(call, kind === 'environment' ? 'begin' : 'body'));
			const end = textOf(text, argOf(call, 'end'));
			for (const value of named.values) {
				const name = value.value.replace(/^\\/, '');
				if (!name) continue;
				out.push({
					name,
					kind,
					defines: named.arg.defines,
					args,
					...(named.arg.makes?.in ? { in: named.arg.makes.in } : {}),
					...(body !== undefined ? { body } : {}),
					...(end !== undefined ? { end } : {}),
					command: call.command,
					at: call.at,
					nameAt: value.at + (value.value.startsWith('\\') ? 1 : 0)
				});
			}
		}
	}
	return out.sort((a, b) => a.at - b.at);
}

/** the definitions the environments that define names make (\begin{restatable}{thm}{lem} defines \lem) */
export function environmentDefinitionsIn(text: string): Definition[] {
	return definitionsIn(text, environmentCallsIn(text, DEFINED));
}

/** the names definers create from an argument's value (\newlist{steps}{enumerate}{3} makes stepsi and \thestepsi);
 * a value that holds a parameter (#1) names nothing yet */
export function derivedDefinitionsIn(text: string): Definition[] {
	const calls = [...callsIn(text, ['derives']), ...environmentCallsIn(text, ['derives'])];
	const out: Definition[] = [];
	for (const call of calls) {
		for (const named of call.args) {
			for (const value of named.values) {
				const written = value.value.replace(/^\\/, '');
				if (!written || written.includes('#') || written.includes('\\')) continue;
				for (const derived of named.arg.derives ?? []) {
					out.push({
						name: derived.name.replaceAll('{}', written),
						kind: derived.role,
						defines: named.arg.defines ?? 'new',
						args: derived.makes?.args ?? [],
						...(derived.makes?.in ? { in: derived.makes.in } : {}),
						command: call.command,
						at: call.at,
						nameAt: value.at
					});
				}
			}
		}
	}
	return out.sort((a, b) => a.at - b.at);
}
