// a definition a chip makes with a definer the package data knows: an argument that `defines` names what it makes
import { commonCommand, readArgs, rolesOf, type CallArgument } from '$lib/languages/latex/knowledge/calls/commandCalls';
import { definitionsIn } from '$lib/languages/latex/knowledge/calls/definitions';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { isAliasDefiner } from './citeAliases';

export type ReadDefinition = {
	/** as written: `\model`, or the name of an environment, a counter or a color */
	name: string;
	/** what the defined command takes, as `#1#2` */
	params: string;
	/** what the name stands for; null for one made empty (\newcounter, \newif) */
	body: string | null;
	command: string;
	/** just past the definition in the source */
	end: number;
	/** the definer says the body is math (\DeclareMathOperator) */
	math?: true;
	/** the body is the call's other arguments, shown as written */
	code?: true;
};

/** how a chip reads a command's arguments: the parse's reading, else the one most files give */
export function readingOf(name: string): Argument[] | null {
	return Object.hasOwn(BASE_PACKAGE_TABLE.macros, name) ? BASE_PACKAGE_TABLE.macros[name] : (commonCommand(name)?.args ?? null);
}

export function isMandatory(arg: Argument): boolean {
	return /^!?[mrv]/.test(arg.kind);
}

/** every argument the reading requires was read */
export function readsWhole(reading: Argument[], read: CallArgument[]): boolean {
	return reading.filter(isMandatory).length === read.filter((a) => isMandatory(a.arg)).length;
}

// a label or a bibliography entry is a mark in the text, drawn where it stands
const MARKS = new Set(['label', 'citekey']);

export function definesSomething(reading: Argument[]): boolean {
	return reading.some((a) => a.defines && !rolesOf(a).some((role) => MARKS.has(role))) || isAliasDefiner(reading);
}

function textOf(src: string, arg: CallArgument | undefined): string | undefined {
	return arg && src.slice(arg.from, arg.to);
}

/** `nameEnd` is just past the definer's name */
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
