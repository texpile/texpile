// a definition in TeX's own syntax (\def\name#1{...}, \let\a\b, \newif\ifdraft), which the package data does not
// describe: these few kernel names stand in for it
import { commandAt, groupEnd, skipSpace, type SourceToken } from './texSource';
import type { ReadDefinition } from './readDefinition';

const PREFIXES = new Set(['global', 'long', 'outer', 'protected']);
const DEFINERS = new Set(['def', 'gdef', 'edef', 'xdef']);

export function startsTexDefinition(name: string): boolean {
	return PREFIXES.has(name) || DEFINERS.has(name) || name === 'let' || name === 'newif';
}

/** the parameter text of a \def, up to the brace that opens its body; -1 when a blank line or a stray brace comes first */
function bodyOpen(src: string, from: number): number {
	const blankLine = /\n[ \t]*\n/y;
	for (let i = from; i < src.length; i++) {
		const c = src[i];
		blankLine.lastIndex = i;
		if (c === '{') return i;
		if (c === '}' || c === '%' || blankLine.test(src)) return -1;
		if (c === '\\') i = (commandAt(src, i)?.to ?? i + 1) - 1;
	}
	return -1;
}

function letTarget(src: string, from: number): { text: string; to: number } | null {
	let at = skipSpace(src, from);
	if (src[at] === '=') at = src[at + 1] === ' ' ? at + 2 : at + 1;
	const command = commandAt(src, at);
	if (command) return { text: src.slice(command.from, command.to), to: command.to };
	return at < src.length && !/\s/.test(src[at]) ? { text: src[at], to: at + 1 } : null;
}

/** a command, or a character made active (\def&{...} in a package's code) */
function definedAt(src: string, at: number): SourceToken | null {
	const command = commandAt(src, at);
	if (command) return command;
	return /[^\s{}%#\\]/.test(src[at] ?? ' ') ? { name: src[at], from: at, to: at + 1 } : null;
}

export function readTexDefinition(src: string, at: number): ReadDefinition | null {
	let head = commandAt(src, at);
	while (head && PREFIXES.has(head.name)) head = commandAt(src, skipSpace(src, head.to));
	if (!head) return null;
	const defined = definedAt(src, skipSpace(src, head.to));
	if (!defined) return null;
	const name = src.slice(defined.from, defined.to);
	if (DEFINERS.has(head.name)) {
		const open = bodyOpen(src, defined.to);
		const end = open < 0 ? -1 : groupEnd(src, open);
		if (end < 0) return null;
		const params = src.slice(defined.to, open).trim();
		return { name, params, body: src.slice(open + 1, end - 1), command: head.name, end };
	}
	if (head.name === 'let') {
		const target = letTarget(src, defined.to);
		return target && { name, params: '', body: target.text, command: 'let', end: target.to };
	}
	if (head.name === 'newif' && defined.name.startsWith('if')) return { name, params: '', body: null, command: 'newif', end: defined.to };
	return null;
}
