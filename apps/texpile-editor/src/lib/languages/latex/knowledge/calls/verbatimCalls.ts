// the commands that read an argument verbatim (\verb, \lstinline, \mint): the reading most files that define the name give
import commandsIndex from '../data/commands.json';
import type { Argument } from '../types';

const INDEX = (commandsIndex as unknown as { commands: Record<string, { args: Argument[] }> }).commands;

// TeX takes any other character as a \verb delimiter; these end or open something else
export const NOT_DELIMITER = /[A-Za-z\s*}\\\]%]/;

let names: string[] | null = null;
let braced: Set<string> | null = null;

function bracedNames(): Set<string> {
	braced ??= new Set(verbatimCommandNames().filter((n) => INDEX[n].args.some((a) => a.kind === 'v' && a.braced)));
	return braced;
}

/** where `char` next occurs on the line of `from`, plus `after`; -1 when it does not */
function indexInLine(text: string, char: string, from: number, after = 0): number {
	for (let i = from; i < text.length && text[i] !== '\n'; i++) if (text[i] === char) return i + after;
	return -1;
}

/** the commands with a verbatim argument, longest name first */
export function verbatimCommandNames(): string[] {
	names ??= Object.keys(INDEX)
		.filter((n) => INDEX[n].args.some((a) => a.kind === 'v'))
		.sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
	return names;
}

/** the names as one regex alternation */
export function verbatimCommandAlternation(): string {
	return verbatimCommandNames().join('|');
}

/** where the verbatim argument of `name` starts in a call whose name ends at `from`: past the arguments before it
 * (the star, [options], {language}); -1 when one of those never closes on the line */
export function verbatimArgumentStart(text: string, from: number, name: string): number {
	let at = from;
	for (const arg of INDEX[name].args) {
		if (arg.kind === 'v') return at;
		if (arg.kind === 's') {
			if (text[at] === '*') at++;
			continue;
		}
		const [open, close] = arg.kind === 'o' ? ['[', ']'] : ['{', '}'];
		if (text[at] === open) {
			const end = indexInLine(text, close, at + 1);
			if (end < 0) return -1;
			at = end + 1;
		} else if (arg.kind === 'm') return -1;
	}
	return -1;
}

/** the index past the verbatim text that opens at `start`: a brace group where `name` takes one, else the text up to
 * the next occurrence of its delimiter character; -1 when `start` is no delimiter or the text never closes on the line */
export function verbatimArgumentEnd(text: string, start: number, name: string): number {
	const open = text[start];
	if (open === undefined || NOT_DELIMITER.test(open)) return -1;
	if (open !== '{' || !bracedNames().has(name)) return indexInLine(text, open, start + 1, 1);
	let depth = 0;
	for (let i = start; i < text.length && text[i] !== '\n'; i++) {
		if (text[i] === '{') depth++;
		else if (text[i] === '}' && --depth === 0) return i + 1;
	}
	return -1;
}

/** the index past the verbatim call of `name` whose name ends at `from`; -1 when it has no verbatim text there */
export function verbatimCallEnd(text: string, from: number, name: string): number {
	const start = verbatimArgumentStart(text, from, name);
	return start < 0 ? -1 : verbatimArgumentEnd(text, start, name);
}
