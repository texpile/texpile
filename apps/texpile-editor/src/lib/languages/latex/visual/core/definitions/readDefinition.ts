import { commonCommand, readArgs, rolesOf, type CallArgument } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { definitionsIn } from '$lib/languages/latex/knowledge/calls/definitions';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { isAliasDefiner } from './citeAliases';

export type ReadDefinition = {
	name: string;
	params: string;
	body: string | null;
	command: string;
	end: number;
	math?: true;
	code?: true;
};

export function readingOf(name: string): Argument[] | null {
	return Object.hasOwn(BASE_PACKAGE_TABLE.macros, name) ? BASE_PACKAGE_TABLE.macros[name] : (commonCommand(name)?.args ?? null);
}

export function isMandatory(arg: Argument): boolean {
	return /^!?[mrv]/.test(arg.kind);
}

export function readsWhole(reading: Argument[], read: CallArgument[]): boolean {
	return reading.filter(isMandatory).length === read.filter((a) => isMandatory(a.arg)).length;
}

const MARKS = new Set(['label', 'citekey']);

export function definesSomething(reading: Argument[]): boolean {
	return reading.some((a) => a.defines && !rolesOf(a).some((role) => MARKS.has(role))) || isAliasDefiner(reading);
}

function textOf(src: string, arg: CallArgument | undefined): string | undefined {
	return arg && src.slice(arg.from, arg.to);
}

export function readDataDefinition(src: string, at: number, command: string, nameEnd: number): ReadDefinition | null {
	const reading = readingOf(command);
	if (!reading || !definesSomething(reading)) return null;
	const { end, args } = readArgs(src, nameEnd, { args: reading });
	// a citation key given a short name is shown as the key and its name
	if (isAliasDefiner(reading)) {
		return args.length === 2 && args[0].values.length === 1
			? { name: args[0].values[0].value, params: '', body: textOf(src, args[1]) ?? null, command, end }
			: null;
	}
	const named = args.find((a) => a.arg.defines);
	if (!named || named.values.length !== 1 || !readsWhole(reading, args)) return null;
	const [made] = definitionsIn(src, [{ command, at, end, args }]);
	if (!made) {
		const rest = args.filter((a) => a !== named && a.arg.kind !== 's').map((a) => src.slice(a.from, a.to).trim());
		return { name: named.values[0].value, params: '', body: rest.join(' ') || null, command, end, code: true };
	}
	const text = textOf(
		src,
		args.find((a) => rolesOf(a.arg).includes('text'))
	);
	return {
		name: made.kind === 'macro' ? `\\${made.name}` : made.name,
		params: made.kind === 'macro' ? made.args.map((_, i) => `#${i + 1}`).join('') : '',
		body: made.body ?? text ?? null,
		command,
		end,
		...(made.in === 'math' ? { math: true as const } : {})
	};
}
