import type { SyntaxNode } from '@lezer/common';
import type { Argument } from '../../../knowledge/types';
import { rolesOf } from '../../../knowledge/calls/commandCalls';
import { bodyOf, type Stretch } from './stretch';
import type { Piece, PieceCursor } from './pieceCursor';

/** `present` false: an optional one left out, or a mandatory one with nothing to take; `from` and `to` take in the delimiters */
export type TreeArg = {
	kind: string;
	present: boolean;
	braced: boolean;
	open: string;
	close: string;
	from: number;
	to: number;
	body: Stretch | null;
};

export type TreeCall = { name: string; node: SyntaxNode; from: number; to: number; args: TreeArg[] };

const TOKEN_ARGS = new Set(['ControlWord', 'ControlSymbol', 'OpenBracket', 'CloseBracket', 'Verb', 'InlineMath', 'ParenMath']);

function absent(kind: string, at: number): TreeArg {
	return { kind, present: false, braced: false, open: '', close: '', from: at, to: at, body: null };
}

/** skips the spaces and comments TeX skips before an argument */
function skipBlanks(cursor: PieceCursor): void {
	for (let p = cursor.peek(); p && (p.kind === 'space' || (p.kind === 'node' && p.node.name === 'Comment')); p = cursor.peek())
		cursor.next();
}

function isNode(p: Piece | null, name: string): boolean {
	return !!p && p.kind === 'node' && p.node.name === name;
}

// a bracket argument longer than this is a stray bracket; a long command's one may hold paragraphs
const LONGEST_BRACKET = 20_000;

function bracketArg(cursor: PieceCursor, kind: string): TreeArg | null {
	const open = cursor.next()!;
	let depth = 1;
	for (let p = cursor.next(); p && p.from - open.from < LONGEST_BRACKET; p = cursor.next()) {
		if (isNode(p, 'OpenBracket')) depth++;
		else if (isNode(p, 'CloseBracket') && --depth === 0)
			return {
				kind,
				present: true,
				braced: false,
				open: '[',
				close: ']',
				from: open.from,
				to: p.to,
				body: { parent: cursor.stretch.parent, from: open.to, to: p.from }
			};
	}
	return null;
}

/** an argument between two characters of the text (\put(1,2), d<> and r() kinds) */
function charArg(cursor: PieceCursor, kind: string, open: string, close: string): TreeArg | null {
	const first = cursor.peek();
	if (!first || first.kind !== 'word' || cursor.src[first.from] !== open) return null;
	cursor.nextChar();
	for (let p = cursor.peek(); p; p = cursor.peek()) {
		if (isNode(p, 'ParBreak')) return null;
		if (p.kind === 'word') {
			const at = cursor.src.indexOf(close, p.from);
			if (at >= 0 && at < p.to) {
				while (cursor.pos <= at) cursor.nextChar();
				return {
					kind,
					present: true,
					braced: false,
					open,
					close,
					from: first.from,
					to: at + 1,
					body: { parent: cursor.stretch.parent, from: first.from + 1, to: at }
				};
			}
		}
		cursor.next();
	}
	return null;
}

/** reads the call a command piece starts, the cursor just past the command, and says where it ends */
export type NestedCall = (cursor: PieceCursor, command: Piece) => number;

/** a group, or the one token TeX takes without braces */
function tokenArg(cursor: PieceCursor, kind: string, nested?: NestedCall | null): TreeArg | null {
	const p = cursor.peek();
	if (!p) return null;
	if (isNode(p, 'Group')) {
		cursor.next();
		return { kind, present: true, braced: true, open: '{', close: '}', from: p.from, to: p.to, body: bodyOf(p.node) };
	}
	if (isNode(p, 'UrlArgument')) {
		cursor.next();
		return {
			kind,
			present: true,
			braced: true,
			open: '{',
			close: '}',
			from: p.from,
			to: p.to,
			body: { parent: p.node, from: p.from + 1, to: p.to - 1 }
		};
	}
	if (kind === 'g') return null;
	if (p.kind === 'word') {
		const char = cursor.nextChar()!;
		return {
			kind,
			present: true,
			braced: false,
			open: '',
			close: '',
			from: char.from,
			to: char.to,
			body: { parent: cursor.stretch.parent, from: char.from, to: char.to }
		};
	}
	if (p.kind === 'node' && TOKEN_ARGS.has(p.node.name)) {
		cursor.next();
		const command = p.node.name === 'ControlWord' || p.node.name === 'ControlSymbol';
		const to = command && nested ? nested(cursor, p) : p.to;
		return {
			kind,
			present: true,
			braced: false,
			open: '',
			close: '',
			from: p.from,
			to,
			body: { parent: cursor.stretch.parent, from: p.from, to }
		};
	}
	return null;
}

function readArg(cursor: PieceCursor, spec: Argument, nested?: NestedCall): TreeArg {
	const written = spec.kind;
	const kind = written.replace(/^!/, '');
	const mark = cursor.save();
	if (!written.startsWith('!')) skipBlanks(cursor);
	const at = cursor.pos;
	let arg: TreeArg | null = null;
	if (kind === 's' || kind[0] === 't') {
		const p = cursor.peek();
		const star = kind === 's' ? '*' : kind[1];
		if (p?.kind === 'word' && cursor.src[p.from] === star) {
			cursor.nextChar();
			arg = { kind, present: true, braced: false, open: '', close: '', from: p.from, to: p.from + 1, body: null };
		}
	} else if (kind === 'o' || kind === 'd[]') {
		if (isNode(cursor.peek(), 'OpenBracket')) arg = bracketArg(cursor, kind);
	} else if (/^[dr]..$/.test(kind)) arg = charArg(cursor, kind, kind[1], kind[2]);
	// the command a definer names is one token, whatever it takes itself
	else if (kind === 'm' || kind === 'g' || kind === 'v') arg = tokenArg(cursor, kind, rolesOf(spec).includes('macro') ? null : nested);
	if (arg) return arg;
	cursor.restore(mark);
	return absent(kind, at);
}

export function readCall(cursor: PieceCursor, command: Piece, name: string, signature: readonly Argument[], nested?: NestedCall): TreeCall {
	const args = signature.map((a) => readArg(cursor, a, nested));
	const last = args.filter((a) => a.present).pop();
	return { name, node: command.node, from: command.from, to: last ? last.to : command.to, args };
}

/** the arguments with braces, or the token a brace-less one took, in order */
export function mandatoryArgs(call: TreeCall): TreeArg[] {
	return call.args.filter((a) => a.present && (a.kind === 'm' || a.kind === 'g' || a.kind === 'v' || a.kind[0] === 'r'));
}

export function optionalArg(call: TreeCall): TreeArg | undefined {
	return call.args.find((a) => a.present && a.open === '[');
}

export function hasStar(call: TreeCall): boolean {
	return call.args.some((a) => a.present && a.kind === 's');
}

/** a brace argument nothing closes: the tree ends it where its container ends */
export function unclosedGroup(call: TreeCall): TreeArg | undefined {
	return call.args.find((a) => a.present && a.open === '{' && a.body?.parent.lastChild?.name === 'GroupEnd');
}

export function hasUnclosedGroup(call: TreeCall): boolean {
	return unclosedGroup(call) !== undefined;
}

export function argText(src: string, arg: TreeArg | undefined): string {
	return arg?.body ? src.slice(arg.body.from, arg.body.to) : '';
}
