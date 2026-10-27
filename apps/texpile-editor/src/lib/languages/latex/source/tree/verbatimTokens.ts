import { ContextTracker, ExternalTokenizer, type InputStream } from '@lezer/lr';
import { commonEnvNames, hasLiteralBody } from '../../knowledge/environments/envFacts';
import { verbatimCallEnd, verbatimCommandNames } from '../../knowledge/calls/verbatimCalls';
import { commandNames, commonCommand, rolesOf } from '../../knowledge/calls/commandCalls';
import { NO_OWN_MATH, type OwnMath } from './ownMath';
import {
	CloseBracket,
	Dollar,
	DoubleDollar,
	EndEnv,
	OpenBracket,
	OwnMathClose,
	OwnMathOpen,
	UrlArgument,
	VerbatimBegin,
	VerbatimBody,
	Verb
} from './parser.terms';

const BACKSLASH = 92;
const OPEN = 123;
const CLOSE = 125;
const NEWLINE = 10;
const DOLLAR = 36;
const BRACKET = 91;
const LINE_REACH = 4096;
const URL_COMMAND_REACH = 256;

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
function urlCommands(): Set<string> {
	urlNames ??= new Set(
		commandNames(['url']).filter((name) => {
			const first = commonCommand(name)?.args.find((a) => a.kind === 'm');
			return !!first && rolesOf(first).includes('url');
		})
	);
	return urlNames;
}

const URL_COMMAND_BEFORE = /\\([A-Za-z]+)\*?[ \t]*(?:\[[^\]\n]*\][ \t]*)*$/;

function readWord(input: InputStream, at: number): string {
	let word = '';
	for (let c = input.peek(at); (c >= 65 && c <= 90) || (c >= 97 && c <= 122); c = input.peek(at + word.length))
		word += String.fromCharCode(c);
	return word;
}

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
	for (let i = -1, c = input.peek(i); c >= 0 && c !== NEWLINE && -i < URL_COMMAND_REACH; c = input.peek(--i))
		line = String.fromCharCode(c) + line;
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

function environmentAt(input: InputStream, at: number, word: string): { name: string; end: number } | null {
	if (input.peek(at) !== BACKSLASH || readWord(input, at + 1) !== word) return null;
	let i = at + 1 + word.length;
	while (input.peek(i) === 32 || input.peek(i) === 9) i++;
	if (input.peek(i) !== OPEN) return null;
	let name = '';
	for (i++; input.peek(i) !== CLOSE; i++) {
		const c = input.peek(i);
		if (c < 0 || c === NEWLINE || c === OPEN) return null;
		name += String.fromCharCode(c);
	}
	return { name, end: i + 1 };
}

function atLineStart(input: InputStream): boolean {
	let i = -1;
	while (input.peek(i) === 32 || input.peek(i) === 9) i--;
	return input.peek(i) === NEWLINE;
}

type VerbatimContext = { name: string; brackets: number } | null;

export const verbatimContext = new ContextTracker<VerbatimContext>({
	start: null,
	shift(context, term, _stack, input) {
		if (term === VerbatimBegin) {
			const name = environmentAt(input, 0, 'begin')?.name;
			return name === undefined ? null : { name, brackets: 0 };
		}
		if (term === EndEnv) return null;
		if (context && term === OpenBracket) return { ...context, brackets: context.brackets + 1 };
		if (context && term === CloseBracket) return { ...context, brackets: Math.max(0, context.brackets - 1) };
		return context;
	},
	hash: (context) => (context ? [...context.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) * 31 + context.brackets : 0),
	strict: false
});

export function verbatimTokensFor(own: OwnMath): ExternalTokenizer {
	return new ExternalTokenizer((input, stack) => {
		const context = stack.context as VerbatimContext;
		const afterBegin = input.peek(-1) === CLOSE && input.next !== BRACKET && input.next !== OPEN && input.next !== NEWLINE;
		if (stack.canShift(VerbatimBody) && !context?.brackets && (atLineStart(input) || afterBegin)) {
			let i = 0;
			for (; input.peek(i) >= 0; i++) {
				const end = input.peek(i) === BACKSLASH ? environmentAt(input, i, 'end') : null;
				if (end && (context === null ? literalEnvironments().has(end.name) : end.name === context.name)) break;
			}
			if (i > 0) input.acceptToken(VerbatimBody, i);
			return;
		}
		if (input.next === DOLLAR) {
			const double = input.peek(1) === DOLLAR && stack.canShift(DoubleDollar);
			input.acceptToken(double ? DoubleDollar : Dollar, double ? 2 : 1);
			return;
		}
		if (input.next === OPEN && stack.canShift(UrlArgument)) {
			const command = commandBefore(input);
			const length = command && urlCommands().has(command) ? groupLength(input) : -1;
			if (length > 0) input.acceptToken(UrlArgument, length);
			return;
		}
		if (input.next !== BACKSLASH) return;
		const begin = environmentAt(input, 0, 'begin');
		if (begin) {
			if (literalEnvironments().has(begin.name)) input.acceptToken(VerbatimBegin, begin.end);
			return;
		}
		const word = readWord(input, 1);
		if (own.opens.has(word)) return input.acceptToken(OwnMathOpen, 1 + word.length);
		if (own.closes.has(word) && stack.canShift(OwnMathClose)) return input.acceptToken(OwnMathClose, 1 + word.length);
		if (!verbCommands().has(word)) return;
		const end = verbatimCallEnd(readLine(input), 1 + word.length, word);
		if (end > 0) input.acceptToken(Verb, end);
	});
}

export const verbatimTokens = verbatimTokensFor(NO_OWN_MATH);
