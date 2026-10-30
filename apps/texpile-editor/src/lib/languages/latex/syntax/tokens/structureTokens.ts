import { ExternalTokenizer, type InputStream } from '@lezer/lr';
import { commonEnvNames, hasLiteralBody } from '../../knowledge/environments/envFacts';
import { verbatimCallEnd, verbatimCommandNames } from '../../knowledge/calls/verbatimCalls';
import { commandNames, commonCommand, rolesOf } from '../../knowledge/calls/commandCalls';
import { BASE_TABLE } from '../../knowledge/bundledFiles';
import type { Argument } from '../../knowledge/types';
import { NO_OWN_SYNTAX, type OwnSyntax } from './ownSyntax';
import {
	BeginEnv,
	CloseDisplay,
	CloseInline,
	ControlWord,
	Dollar,
	DoubleDollar,
	EndEnv,
	EnvEnd,
	GroupEnd,
	MathEnd,
	OpenDisplay,
	OpenInline,
	OwnMathClose,
	OwnMathOpen,
	Skipped,
	StrayClose,
	StrayEnd,
	StrayMath,
	UrlArgument,
	VerbatimBegin,
	VerbatimBody,
	Verb
} from '../parser.terms';
import { closeBraceReading, closedAtEnd, endReading, environmentAt, readWord, type InnerClose, type OpenConstruct } from './openConstructs';
import { LOOK_BACK, skippedLength } from './skippedText';

const BACKSLASH = 92;
const OPEN = 123;
const CLOSE = 125;
const NEWLINE = 10;
const DOLLAR = 36;
const BRACKET = 91;
const LINE_REACH = 4096;

let verbatimNames: Set<string> | null = null;
function literalEnvironments(): Set<string> {
	verbatimNames ??= new Set(commonEnvNames(hasLiteralBody));
	return verbatimNames;
}

let verbNames: Set<string> | null = null;
function verbCommands(): Set<string> {
	verbNames ??= new Set(verbatimCommandNames());
	return verbNames;
}

let urlNames: Set<string> | null = null;
function urlFirst(args: Argument[] | undefined): boolean {
	const first = args?.find((a) => a.kind === 'm');
	return !!first && rolesOf(first).includes('url');
}

// the base table's reading too: url's \path, where most files that define the name are TikZ's
function urlCommands(): Set<string> {
	urlNames ??= new Set([
		...commandNames(['url']).filter((name) => urlFirst(commonCommand(name)?.args)),
		...Object.keys(BASE_TABLE.macros).filter((name) => urlFirst(BASE_TABLE.macros[name]))
	]);
	return urlNames;
}

const URL_COMMAND_BEFORE = /\\([A-Za-z]+)\*?[ \t]*(?:\[[^\]\n]*\][ \t]*)*$/;

function readLine(input: InputStream): string {
	let line = '';
	for (let i = 0, c = input.peek(0); c >= 0 && c !== NEWLINE && i < LINE_REACH; c = input.peek(++i)) line += String.fromCharCode(c);
	return line;
}

function commandBefore(input: InputStream): string | undefined {
	const c = input.peek(-1);
	if (!((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 42 || c === 32 || c === 9 || c === 93)) return undefined;
	return URL_COMMAND_BEFORE.exec(readLineBefore(input))?.[1];
}

function readLineBefore(input: InputStream): string {
	let line = '';
	for (let i = -1, c = input.peek(i); c >= 0 && c !== NEWLINE && -i <= LOOK_BACK; c = input.peek(--i)) line = String.fromCharCode(c) + line;
	return line;
}

function groupLength(input: InputStream): number {
	let depth = 0;
	for (let i = 0, c = input.peek(0); c >= 0 && c !== NEWLINE && i < LINE_REACH; c = input.peek(++i)) {
		if (c === OPEN) depth++;
		else if (c === CLOSE && --depth === 0) return i + 1;
	}
	return -1;
}

const PAREN_OPEN = 40;
const PAREN_CLOSE = 41;
const BRACKET_CLOSE = 93;

function isParBreak(input: InputStream): boolean {
	if (input.next !== NEWLINE) return false;
	let i = 1;
	while (input.peek(i) === 32 || input.peek(i) === 9) i++;
	return input.peek(i) === NEWLINE;
}

function closeInner(input: InputStream, stack: { canShift(term: number): boolean }, inner: InnerClose): boolean {
	const term = inner === 'math' ? MathEnd : EnvEnd;
	if (!stack.canShift(term)) return false;
	input.acceptToken(term, 0);
	return true;
}

// a body that closes on the begin line is a definition's (\newcommand{\bv}{\begin{verbatim}}), which TeX does not read as verbatim
function closesAfter(input: InputStream, at: number): boolean {
	let i = at;
	while (input.peek(i) === 32 || input.peek(i) === 9) i++;
	return input.peek(i) === CLOSE;
}

function atLineStart(input: InputStream): boolean {
	let i = -1;
	while ((input.peek(i) === 32 || input.peek(i) === 9) && -i <= LOOK_BACK) i--;
	return input.peek(i) === NEWLINE;
}

export function structureTokensFor(own: OwnSyntax): ExternalTokenizer {
	const unread = new Set(own.literals.unread);
	const read = new Set(own.literals.read);
	const ownVerbatim = new Map(own.literals.verbatimCommands.map((c) => [c.name, c.args]));
	function isLiteral(name: string): boolean {
		return unread.has(name) || (!read.has(name) && literalEnvironments().has(name));
	}
	return new ExternalTokenizer(
		(input, stack) => {
			const open = stack.context as OpenConstruct;
			const context = open?.kind === 'verbatim' ? open : null;
			const afterBegin = input.peek(-1) === CLOSE && input.next !== BRACKET && input.next !== OPEN && input.next !== NEWLINE;
			if (stack.canShift(VerbatimBody) && !context?.brackets && (atLineStart(input) || afterBegin)) {
				let i = 0;
				for (; input.peek(i) >= 0; i++) {
					const end = input.peek(i) === BACKSLASH ? environmentAt(input, i, 'end') : null;
					if (end && (context === null ? isLiteral(end.name) : end.name === context.name)) break;
				}
				if (i > 0) return input.acceptToken(VerbatimBody, i);
			}
			const inMath = open?.kind === 'math' ? open : null;
			if (input.next === DOLLAR) {
				const double = input.peek(1) === DOLLAR;
				if (inMath?.opener === '$') return input.acceptToken(Dollar, 1);
				if (inMath?.opener === '$$' && double) return input.acceptToken(DoubleDollar, 2);
				if (!inMath && double && stack.canShift(DoubleDollar)) return input.acceptToken(DoubleDollar, 2);
				if (!inMath && stack.canShift(Dollar)) return input.acceptToken(Dollar, 1);
				return input.acceptToken(StrayMath, 1);
			}
			if (inMath && !context && isParBreak(input)) {
				closeInner(input, stack, 'math');
				return;
			}
			if (input.next === OPEN && stack.canShift(UrlArgument)) {
				const command = commandBefore(input);
				const length = command && urlCommands().has(command) ? groupLength(input) : -1;
				if (length > 0) input.acceptToken(UrlArgument, length);
				return;
			}
			if (input.next < 0) {
				const closes = closedAtEnd(open);
				if (closes === 'group' && stack.canShift(GroupEnd)) input.acceptToken(GroupEnd, 0);
				else if (closes && closes !== 'group') closeInner(input, stack, closes);
				return;
			}
			if (input.next === CLOSE && !context) {
				const reading = closeBraceReading(open);
				if (reading === 'stray') input.acceptToken(StrayClose, 1);
				else if (reading !== 'close') closeInner(input, stack, reading);
				return;
			}
			if (input.next !== BACKSLASH) return;
			const symbol = input.peek(1);
			if (!context && (symbol === PAREN_OPEN || symbol === BRACKET)) {
				if (!inMath) input.acceptToken(symbol === PAREN_OPEN ? OpenInline : OpenDisplay, 2);
				return;
			}
			if (!context && (symbol === PAREN_CLOSE || symbol === BRACKET_CLOSE)) {
				if (inMath?.opener === (symbol === PAREN_CLOSE ? '\\(' : '\\['))
					input.acceptToken(symbol === PAREN_CLOSE ? CloseInline : CloseDisplay, 2);
				return;
			}
			const begin = environmentAt(input, 0, 'begin');
			if (begin) {
				input.acceptToken(isLiteral(begin.name) && !closesAfter(input, begin.end) ? VerbatimBegin : BeginEnv, begin.end);
				return;
			}
			const end = environmentAt(input, 0, 'end');
			if (end) {
				const reading = context ? (end.name === context.name ? 'end' : 'stray') : endReading(open, end.name);
				if (reading === 'end') input.acceptToken(EndEnv, end.end);
				else if (reading === 'stray' || !closeInner(input, stack, reading)) input.acceptToken(StrayEnd, end.end);
				return;
			}
			const word = readWord(input, 1, open.letters);
			if (!word) return;
			if (word === 'iffalse' && !context) {
				const skipped = skippedLength(input);
				if (skipped > 0) return input.acceptToken(Skipped, skipped);
			}
			if (own.math.opens.has(word)) return input.acceptToken(OwnMathOpen, 1 + word.length);
			if (own.math.closes.has(word) && inMath?.opener === 'own') return input.acceptToken(OwnMathClose, 1 + word.length);
			const args = ownVerbatim.get(word);
			const verbEnd = args || verbCommands().has(word) ? verbatimCallEnd(readLine(input), 1 + word.length, word, args) : 0;
			input.acceptToken(verbEnd > 0 ? Verb : ControlWord, verbEnd > 0 ? verbEnd : 1 + word.length);
		},
		{ contextual: true }
	);
}

export const structureTokens = structureTokensFor(NO_OWN_SYNTAX);
