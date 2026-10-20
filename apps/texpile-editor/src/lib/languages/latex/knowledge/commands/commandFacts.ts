// what a command means where it stands, for code that reads a file before its packages are known: a heading's level,
// a switch, a row rule, a conditional, what it prints, its math class, a register and its value; the reading most files
// that define the name give
import commandsIndex from '../data/commands.json';
import type { CommandFields } from '../types';

export type CommandFacts = Pick<
	CommandFields,
	'section' | 'declares' | 'betweenRows' | 'conditional' | 'prints' | 'mathClass' | 'register' | 'value'
>;

export type Ligature = { input: string; prints: string };

type FactField = keyof CommandFacts;

const INDEX = (commandsIndex as unknown as { commands: Record<string, CommandFacts> }).commands;

/** what the kernel's input conventions print (--- an em dash), longest input first */
export const LIGATURES: Ligature[] = [...(commandsIndex as unknown as { ligatures: Ligature[] }).ligatures].sort(
	(a, b) => b.input.length - a.input.length
);

export function commonFacts(name: string): CommandFacts {
	return Object.hasOwn(INDEX, name) ? INDEX[name] : {};
}

const named = new Map<string, string[]>();

/** the commands whose `field` is set, or equals `value`, longest name first */
export function commandsWith<F extends FactField>(field: F, value?: NonNullable<CommandFacts[F]>): string[] {
	const key = `${field}=${value ?? ''}`;
	let names = named.get(key);
	if (!names) {
		names = Object.keys(INDEX)
			.filter((n) => INDEX[n][field] != null && (value === undefined || INDEX[n][field] === value))
			.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
		named.set(key, names);
	}
	return names;
}
