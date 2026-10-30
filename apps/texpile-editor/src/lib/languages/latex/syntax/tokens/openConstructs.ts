import { ContextTracker, type InputStream } from '@lezer/lr';
import {
	BeginEnv,
	CloseBracket,
	CloseDisplay,
	CloseInline,
	ControlWord,
	Dollar,
	DoubleDollar,
	EndEnv,
	EnvEnd,
	GroupEnd,
	MathEnd,
	OpenBracket,
	OpenDisplay,
	OpenInline,
	OwnMathClose,
	OwnMathOpen,
	UrlArgument,
	VerbatimBegin
} from '../parser.terms';

const BACKSLASH = 92;
const OPEN = 123;
const CLOSE = 125;
const NEWLINE = 10;

/** how a math span opened, which says what closes it */
export type MathOpener = '$' | '$$' | '\\(' | '\\[' | 'own';

/** extra letters in command names: `@` after \makeatletter and in a package file, `_` and `:` after \ExplSyntaxOn */
export const AT_LETTER = 1;
export const EXPL_LETTERS = 2;

// `depth` counts the frames below; `deeper` the groups and environments opened past MAX_DEPTH, which share its hash
type Frame = { parent: OpenConstruct | null; letters: number; hash: number; depth: number; deeper: number };

// Lezer cuts a stack this deep down by forced reductions, which break on the context records a new hash writes
const MAX_DEPTH = 256;

/** what is open at a point of the parse, innermost first */
export type OpenConstruct =
	| (Frame & { kind: 'document' })
	| (Frame & { kind: 'group' })
	| (Frame & { kind: 'math'; opener: MathOpener })
	| (Frame & { kind: 'environment'; name: string })
	| (Frame & { kind: 'verbatim'; name: string; brackets: number });

function hashOf(parent: OpenConstruct | null, kind: string, letters: number, name = '', brackets = 0): number {
	let h = (parent?.hash ?? 7) * 31 + kind.length * 4 + letters;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
	return (h * 31 + brackets) | 0;
}

function document(letters: number): OpenConstruct {
	return { kind: 'document', parent: null, letters, hash: hashOf(null, 'document', letters), depth: 0, deeper: 0 };
}

function group(parent: OpenConstruct): OpenConstruct {
	return {
		kind: 'group',
		parent,
		letters: parent.letters,
		hash: hashOf(parent, 'group', parent.letters),
		depth: parent.depth + 1,
		deeper: 0
	};
}

function environment(parent: OpenConstruct, name: string): OpenConstruct {
	return {
		kind: 'environment',
		name,
		parent,
		letters: parent.letters,
		hash: hashOf(parent, 'environment', parent.letters, name),
		depth: parent.depth + 1,
		deeper: 0
	};
}

function math(parent: OpenConstruct, opener: MathOpener): OpenConstruct {
	return {
		kind: 'math',
		opener,
		parent,
		letters: parent.letters,
		hash: hashOf(parent, 'math', parent.letters, opener),
		depth: parent.depth + 1,
		deeper: 0
	};
}

function verbatim(parent: OpenConstruct, name: string, brackets: number): OpenConstruct {
	return {
		kind: 'verbatim',
		name,
		brackets,
		parent,
		letters: parent.letters,
		hash: hashOf(parent, 'verbatim', parent.letters, name, brackets),
		depth: parent.depth + 1,
		deeper: 0
	};
}

function withLetters(open: OpenConstruct, letters: number): OpenConstruct {
	if (open.letters === letters) return open;
	const name = 'name' in open ? open.name : 'opener' in open ? open.opener : '';
	const brackets = 'brackets' in open ? open.brackets : 0;
	return { ...open, letters, hash: hashOf(open.parent, open.kind, letters, name, brackets) };
}

// \ProvidesExplPackage and its kin turn expl3's syntax on for the rest of the file
const EXPL_ON = new Set(['ExplSyntaxOn', 'ProvidesExplPackage', 'ProvidesExplClass', 'ProvidesExplFile']);

function lettersAfter(letters: number, word: string): number {
	if (word === 'makeatletter') return letters | AT_LETTER;
	if (word === 'makeatother') return letters & ~AT_LETTER;
	if (EXPL_ON.has(word)) return letters | EXPL_LETTERS;
	if (word === 'ExplSyntaxOff') return letters & ~EXPL_LETTERS;
	return letters;
}

const OPENED_BY = new Map<number, MathOpener>([
	[OpenInline, '\\('],
	[OpenDisplay, '\\['],
	[OwnMathOpen, 'own']
]);
const CLOSES = new Set([CloseInline, CloseDisplay, OwnMathClose, MathEnd]);

function isLetter(c: number, letters: number): boolean {
	if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) return true;
	if (c === 64) return (letters & AT_LETTER) !== 0;
	return (c === 95 || c === 58) && (letters & EXPL_LETTERS) !== 0;
}

export function readWord(input: InputStream, at: number, letters = 0): string {
	let word = '';
	for (let c = input.peek(at); isLetter(c, letters); c = input.peek(at + word.length)) word += String.fromCharCode(c);
	return word;
}

export function environmentAt(input: InputStream, at: number, word: 'begin' | 'end'): { name: string; end: number } | null {
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
	return { name: name.trim(), end: i + 1 };
}

function opened(open: OpenConstruct, inner: () => OpenConstruct): OpenConstruct {
	return open.depth < MAX_DEPTH ? inner() : { ...open, deeper: open.deeper + 1 };
}

function closed(open: OpenConstruct, outer: () => OpenConstruct): OpenConstruct {
	return open.deeper > 0 ? { ...open, deeper: open.deeper - 1 } : outer();
}

function shift(open: OpenConstruct, term: number, input: InputStream): OpenConstruct {
	if (term === ControlWord) {
		return withLetters(open, lettersAfter(open.letters, readWord(input, 1, open.letters)));
	}
	if (term === BeginEnv) return opened(open, () => environment(open, environmentAt(input, 0, 'begin')?.name ?? ''));
	if (term === VerbatimBegin) return verbatim(open, environmentAt(input, 0, 'begin')?.name ?? '', 0);
	if (term === EndEnv || term === EnvEnd)
		return closed(open, () => (open.kind === 'environment' || open.kind === 'verbatim' ? open.parent! : open));
	if (term === Dollar || term === DoubleDollar) {
		const opener = term === Dollar ? '$' : '$$';
		return open.kind === 'math' && open.opener === opener ? open.parent! : math(open, opener);
	}
	const opener = OPENED_BY.get(term);
	if (opener) return math(open, opener);
	if (CLOSES.has(term)) return open.kind === 'math' ? open.parent! : open;
	if (term === GroupEnd) return closed(open, () => (open.kind === 'group' ? open.parent! : open));
	if (open.kind === 'verbatim' && term === OpenBracket) return verbatim(open.parent!, open.name, open.brackets + 1);
	if (open.kind === 'verbatim' && term === CloseBracket) return verbatim(open.parent!, open.name, Math.max(0, open.brackets - 1));
	if (term === UrlArgument) return open;
	const c = input.peek(0);
	if (c === OPEN && open.kind !== 'verbatim') return opened(open, () => group(open));
	if (c === CLOSE && (open.kind === 'group' || open.deeper > 0)) return closed(open, () => open.parent!);
	return open;
}

/** the parser's context: `letters` at the start of the file, AT_LETTER for a package or class file */
export function openConstructsFor(letters: number): ContextTracker<OpenConstruct> {
	return new ContextTracker<OpenConstruct>({
		start: document(letters),
		shift: (open, term, _stack, input) => shift(open, term, input),
		hash: (open) => open.hash
	});
}

export const openConstructs = openConstructsFor(0);

/** what closes first when something encloses the innermost construct: an environment or math left open inside it */
export type InnerClose = 'environment' | 'math';

function innerClose(open: OpenConstruct): InnerClose {
	return open.kind === 'math' ? 'math' : 'environment';
}

/** how an `\end{name}` reads: it ends the innermost environment, closes something open inside it first, or matches nothing */
export function endReading(open: OpenConstruct, name: string): 'end' | InnerClose | 'stray' {
	for (let at: OpenConstruct | null = open; at && at.kind !== 'group' && at.kind !== 'document'; at = at.parent)
		if ((at.kind === 'environment' || at.kind === 'verbatim') && at.name === name) return at === open ? 'end' : innerClose(open);
	return 'stray';
}

/** how a `}` reads: it closes a group, something open inside the group closes first, or no group is open */
export function closeBraceReading(open: OpenConstruct): 'close' | InnerClose | 'stray' {
	if (open.kind === 'group') return 'close';
	if (open.kind === 'document') return 'stray';
	for (let at: OpenConstruct | null = open; at; at = at.parent) if (at.kind === 'group') return innerClose(open);
	return 'stray';
}

/** something the end of the file closes: a group, or an environment or math */
export function closedAtEnd(open: OpenConstruct): 'group' | InnerClose | null {
	if (open.kind === 'document') return null;
	return open.kind === 'group' ? 'group' : innerClose(open);
}
