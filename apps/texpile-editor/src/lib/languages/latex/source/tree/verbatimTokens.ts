import { ContextTracker, ExternalTokenizer, type InputStream } from '@lezer/lr';
import { commonEnvNames, hasLiteralBody } from '../../knowledge/environments/envFacts';
import { ownMath } from './ownMath';
import { Dollar, DoubleDollar, EndEnv, OwnMathClose, OwnMathOpen, VerbatimBegin, VerbatimBody, Verb } from './parser.terms';

const BACKSLASH = 92;
const OPEN = 123;
const CLOSE = 125;
const NEWLINE = 10;
const STAR = 42;
const DOLLAR = 36;
const BRACKET = 91;

let verbatimNames: Set<string> | null = null;
function literalEnvironments(): Set<string> {
	verbatimNames ??= new Set(commonEnvNames(hasLiteralBody));
	return verbatimNames;
}
const VERB_COMMANDS = ['verb', 'lstinline', 'Verb', 'spverb', 'qverb'];

function readWord(input: InputStream, at: number): string {
	let word = '';
	for (let c = input.peek(at); (c >= 65 && c <= 90) || (c >= 97 && c <= 122); c = input.peek(at + word.length))
		word += String.fromCharCode(c);
	return word;
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

export const verbatimContext = new ContextTracker<string | null>({
	start: null,
	shift(context, term, _stack, input) {
		if (term === VerbatimBegin) return environmentAt(input, 0, 'begin')?.name ?? null;
		return term === EndEnv ? null : context;
	},
	hash: (context) => (context ? [...context].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) : 0),
	strict: false
});

export const verbatimTokens = new ExternalTokenizer((input, stack) => {
	const afterBegin = input.peek(-1) === CLOSE && input.next !== BRACKET && input.next !== OPEN && input.next !== NEWLINE;
	if (stack.canShift(VerbatimBody) && (atLineStart(input) || afterBegin)) {
		const name = stack.context as string | null;
		let i = 0;
		for (; input.peek(i) >= 0; i++) {
			const end = input.peek(i) === BACKSLASH ? environmentAt(input, i, 'end') : null;
			if (end && (name === null ? literalEnvironments().has(end.name) : end.name === name)) break;
		}
		if (i > 0) input.acceptToken(VerbatimBody, i);
		return;
	}
	if (input.next === DOLLAR) {
		const double = input.peek(1) === DOLLAR && stack.canShift(DoubleDollar);
		input.acceptToken(double ? DoubleDollar : Dollar, double ? 2 : 1);
		return;
	}
	if (input.next !== BACKSLASH) return;
	const begin = environmentAt(input, 0, 'begin');
	if (begin) {
		if (literalEnvironments().has(begin.name)) input.acceptToken(VerbatimBegin, begin.end);
		return;
	}
	const word = readWord(input, 1);
	const own = ownMath();
	if (own.opens.has(word)) return input.acceptToken(OwnMathOpen, 1 + word.length);
	if (own.closes.has(word) && stack.canShift(OwnMathClose)) return input.acceptToken(OwnMathClose, 1 + word.length);
	if (!VERB_COMMANDS.includes(word)) return;
	let i = 1 + word.length;
	if (input.peek(i) === STAR) i++;
	const open = input.peek(i);
	if (open < 0 || open === NEWLINE || open === 32) return;
	const close = open === OPEN ? CLOSE : open;
	for (i++; input.peek(i) !== close; i++) if (input.peek(i) < 0 || input.peek(i) === NEWLINE) return;
	input.acceptToken(Verb, i + 1);
});
