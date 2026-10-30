import type { StatementKind } from '$lib/draw/editor/figure/figureLanguage';
import { readLoopHead, readParts } from './readPathParts';
import type { ReadStatement, SyntaxPart } from './syntaxParts';
import { commandAt, groupEnd, skipBlank, wordAt } from './texScan';

const PATH_COMMANDS = new Set([
	'\\draw',
	'\\graph',
	'\\path',
	'\\filldraw',
	'\\fill',
	'\\pattern',
	'\\clip',
	'\\shade',
	'\\shadedraw',
	'\\useasboundingbox',
	'\\matrix',
	'\\coordinate'
]);
const FONT_SIZES = /^\\(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)$/;
// definitions and settings, by the groups they take
const GROUPS_TAKEN: Record<string, number> = {
	'\\tikzset': 1,
	'\\pgfkeys': 1,
	'\\usetikzlibrary': 1,
	'\\colorlet': 2,
	'\\definecolor': 3,
	'\\pgfmathsetmacro': 2,
	'\\pgfmathparse': 1,
	'\\pgfmathsetseed': 1
};
const DEFINITIONS = /^\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator)$/;
// what holds statements as a group: a scope, and a layer of pgf's, which takes a name where a scope takes options
const GROUPS = ['scope', 'pgfonlayer'];

function statement(from: number, to: number, kind: StatementKind, command: string, parts: SyntaxPart[] = [], body: ReadStatement[] = []) {
	return { from, to, kind, command, parts, body };
}

function isStatementCommand(command: string) {
	return (
		PATH_COMMANDS.has(command) ||
		/^\\(?:node|pic|foreach|begin|end|def|let|tikzstyle)$/.test(command) ||
		FONT_SIZES.test(command) ||
		DEFINITIONS.test(command) ||
		!!GROUPS_TAKEN[command]
	);
}

/** a control word first on its line */
function startsLine(source: string, at: number) {
	return /^\\[A-Za-z@]/.test(source.slice(at, at + 2)) && /(^|\n)[ \t]*$/.test(source.slice(Math.max(0, at - 200), at));
}

/** past `count` groups after `at`, each with the blank before it */
function pastGroups(source: string, at: number, to: number, count: number) {
	let i = at;
	for (let k = 0; k < count; k++) {
		const open = skipBlank(source, i, to);
		if (source[open] !== '{') break;
		i = groupEnd(source, open, to);
	}
	return i;
}

/** `\newcommand*{\name}[1][x]{...}`, `\def\name#1{...}`, `\tikzstyle{name}=[...]` */
function definitionEnd(source: string, at: number, to: number, command: string) {
	let i = skipBlank(source, at + command.length, to);
	if (command === '\\def' || command === '\\let') {
		i += commandAt(source, i).length;
		if (command === '\\let') {
			i = skipBlank(source, i, to);
			if (source[i] === '=') i = skipBlank(source, i + 1, to);
			return source[i] === '{' ? groupEnd(source, i, to) : i + commandAt(source, i).length;
		}
		const body = source.indexOf('{', i);
		return body < 0 || body >= to ? i : groupEnd(source, body, to);
	}
	if (command === '\\tikzstyle') {
		const value = source.indexOf('=', i);
		if (value < 0 || value >= to) return i;
		const open = skipBlank(source, value + 1, to);
		return source[open] === '[' || source[open] === '{' ? groupEnd(source, open, to) : open;
	}
	if (source[i] === '*') i = skipBlank(source, i + 1, to);
	i = source[i] === '{' ? groupEnd(source, i, to) : i + commandAt(source, i).length;
	for (let open = skipBlank(source, i, to); source[open] === '['; open = skipBlank(source, i, to)) i = groupEnd(source, open, to);
	return pastGroups(source, i, to, 1);
}

/** `\foreach \x in {...} body`: the head's parts, and a group's statements or the one statement after it */
function readLoop(source: string, at: number, to: number): ReadStatement {
	const parts = readLoopHead(source, at, to, at + '\\foreach'.length);
	const i = skipBlank(source, parts.at(-1)!.to, to);
	if (source[i] === '{') {
		const end = groupEnd(source, i, to);
		return statement(at, end, 'foreach', '', parts, readBody(source, i + 1, end - 1).statements);
	}
	const one = readStatement(source, i, to);
	return statement(at, one?.to ?? parts.at(-1)!.to, 'foreach', '', parts, one ? [one] : []);
}

function readGroup(source: string, at: number, to: number, env: string): ReadStatement {
	const [begin, close] = [`\\begin{${env}}`, `\\end{${env}}`];
	let i = skipBlank(source, at + begin.length, to);
	const parts: SyntaxPart[] = [];
	if (env !== 'scope') i = pastGroups(source, i, to, 1);
	else if (source[i] === '[') {
		parts.push({ type: 'options', from: i, to: groupEnd(source, i, to), parts: [] });
		i = parts[0].to;
	}
	const body = readBody(source, i, to, close);
	const end = source.startsWith(close, body.end) ? body.end + close.length : body.end;
	return statement(at, end, 'scope', env === 'scope' ? '' : begin, parts, body.statements);
}

/** the statement at `at`, or null when there is none to read there */
function readStatement(source: string, at: number, to: number): ReadStatement | null {
	const group = GROUPS.find((env) => source.startsWith(`\\begin{${env}}`, at));
	if (group) return readGroup(source, at, to, group);
	const command = commandAt(source, at);
	// a control symbol, `\%`, is text
	if (!/^\\[A-Za-z@]/.test(command) || command === '\\end') return null;
	const after = at + command.length;
	if (command === '\\foreach') return readLoop(source, at, to);
	if (PATH_COMMANDS.has(command) || command === '\\node' || command === '\\pic') {
		const read = readParts(source, after, to, command === '\\node' ? 'text' : 'group', true);
		const kind = command === '\\node' ? 'node' : command === '\\useasboundingbox' ? 'frame' : 'path';
		return statement(at, read.end || after, kind, command === '\\pic' ? '' : command, read.parts);
	}
	if (FONT_SIZES.test(command)) return statement(at, after, 'other', '');
	if (GROUPS_TAKEN[command]) {
		const end = pastGroups(source, after, to, GROUPS_TAKEN[command]);
		const semicolon = skipBlank(source, end, to);
		return statement(at, command.startsWith('\\pgfmath') && source[semicolon] === ';' ? semicolon + 1 : end, 'other', '');
	}
	if (command === '\\def' || command === '\\let' || command === '\\tikzstyle' || DEFINITIONS.test(command))
		return statement(at, definitionEnd(source, at, to, command), 'other', '');
	// anything else, a macro of the document's, runs to its `;` unless a statement or a line of another macro starts first
	const read = readParts(source, after, to, 'group', true, (text, i) => isStatementCommand(commandAt(text, i)) || startsLine(text, i));
	return statement(at, read.end || after, 'other', '', read.parts);
}

/**
 * The statements from `from` to `to`, or to the `close` of the group they are in; what is not a statement (stray
 * text, a brace) is passed over
 */
export function readBody(source: string, from: number, to: number, close?: string) {
	const statements: ReadStatement[] = [];
	let i = skipBlank(source, from, to);
	while (i < to) {
		if (close && source.startsWith(close, i)) return { statements, end: i };
		const read = readStatement(source, i, to);
		if (read && read.to > i) {
			statements.push(read);
			i = skipBlank(source, read.to, to);
			continue;
		}
		const command = commandAt(source, i);
		i = skipBlank(source, i + (command.length || wordAt(source, i).length || 1), to);
	}
	return { statements, end: to };
}
