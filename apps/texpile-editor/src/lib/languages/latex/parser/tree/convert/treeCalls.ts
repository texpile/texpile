// how the import reads a command at the cursor: by its signature, or whole as written
import type { Argument } from '../../../knowledge/types';
import { FILE_ROLES, type Role } from '../../../knowledge/types';
import { rolesOf } from '../../../knowledge/calls/commandCalls';
import { endsInComment } from '../../urlMask';
import { ignoredMacros, isScopedSwitch } from '../../macros';
import type { Piece, PieceCursor } from '../walk/pieceCursor';
import { readCall, type TreeArg, type TreeCall } from '../walk/treeArgs';
import type { TreeImport } from './treeImport';

/** `raw`: kept as written, a block of its own (a \def, a call with a comment among its groups, \bea ... \eea) */
export type ImportCall = TreeCall & { raw?: string };

const DEF_LIKE = new Set(['def', 'edef', 'gdef', 'xdef']);
const LET_LIKE = new Set(['let', 'futurelet']);

export function commandName(im: TreeImport, piece: Piece): string {
	return im.src.slice(piece.from + 1, piece.to);
}

function isComment(p: Piece | null): boolean {
	return !!p && p.kind === 'node' && p.node.name === 'Comment';
}

/** a comment after something on its line */
export function isSamelineComment(src: string, from: number): boolean {
	for (let i = from - 1; i >= 0 && src[i] !== '\n'; i--) if (src[i] !== ' ' && src[i] !== '\t') return true;
	return false;
}

function rawCall(im: TreeImport, piece: Piece, name: string, to: number, text = im.src.slice(piece.from, to)): ImportCall {
	return { name, node: piece.node, from: piece.from, to, args: [], raw: text };
}

/** \def\name<parameters>{body}, up to the body; nothing when no body comes before a blank line */
function defCall(im: TreeImport, cursor: PieceCursor, piece: Piece, name: string): ImportCall | null {
	const mark = cursor.save();
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'node' && p.node.name === 'ParBreak') break;
		if (p.kind === 'node' && p.node.name === 'Group') return rawCall(im, piece, name, p.to);
	}
	cursor.restore(mark);
	return null;
}

/** \let\a\b, \let\a=\b: two command names, each with the letters glued to it (\@fnsymbol outside \makeatletter) */
function letCall(im: TreeImport, cursor: PieceCursor, piece: Piece, name: string): ImportCall | null {
	let units = 0;
	let end = piece.to;
	while (units < 2) {
		const p = cursor.peek();
		if (p?.kind === 'word' && /^=+$/.test(im.src.slice(p.from, p.to))) {
			end = cursor.next()!.to;
			continue;
		}
		if (!p || p.kind !== 'node' || (p.node.name !== 'ControlWord' && p.node.name !== 'ControlSymbol')) break;
		end = cursor.next()!.to;
		units++;
		for (let w = cursor.peek(); w?.kind === 'word' && w.from === end; w = cursor.peek()) end = cursor.next()!.to;
	}
	return units ? rawCall(im, piece, name, end) : null;
}

/** \bea ... \eea for a \bea defined with a parameter the \eea ends */
function delimitedCall(im: TreeImport, cursor: PieceCursor, piece: Piece, name: string, delim: string): ImportCall | null {
	const mark = cursor.save();
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'node' && p.node.name === 'ParBreak') break;
		if (p.kind === 'node' && p.node.name === 'ControlWord' && commandName(im, p) === delim) return rawCall(im, piece, name, p.to);
	}
	cursor.restore(mark);
	return null;
}

/** past the `[...]` at the cursor, brackets nested; -1 when it never closes before a blank line */
function bracketEnd(cursor: PieceCursor): number {
	const mark = cursor.save();
	let depth = 0;
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind !== 'node') continue;
		if (p.node.name === 'ParBreak') break;
		if (p.node.name === 'OpenBracket') depth++;
		else if (p.node.name === 'CloseBracket' && --depth === 0) return p.to;
	}
	cursor.restore(mark);
	return -1;
}

/** a call whose groups a comment on their lines sits among, kept with its comments */
function commentedCall(im: TreeImport, cursor: PieceCursor, piece: Piece, name: string): ImportCall | null {
	const mark = cursor.save();
	// the brackets its other uses give it are its own as well
	const optional = (im.readings.argumentsOf(name) ?? []).some((a) => a.kind.replace(/^!/, '') === 'o');
	let groups = 0;
	let comment = false;
	let end = piece.to;
	for (let p = cursor.peek(); p; p = cursor.peek()) {
		if (p.kind === 'space') cursor.next();
		else if (isComment(p) && isSamelineComment(im.src, p.from)) {
			comment = true;
			end = cursor.next()!.to;
		} else if (p.kind === 'node' && p.node.name === 'Group') {
			groups++;
			end = cursor.next()!.to;
		} else if (optional && p.kind === 'node' && p.node.name === 'OpenBracket') {
			const close = bracketEnd(cursor);
			if (close < 0) break;
			end = close;
		} else break;
	}
	if (groups && comment) {
		const text = im.src.slice(piece.from, end);
		return rawCall(im, piece, name, end, end < im.src.length && endsInComment(text) ? `${text}\n` : text);
	}
	cursor.restore(mark);
	return null;
}

/** \tikz[options]{...} or \tikz ... ; */
function tikzCall(im: TreeImport, cursor: PieceCursor, piece: Piece): ImportCall {
	const call = readCall(cursor, piece, 'tikz', [{ kind: 'o' }]);
	const p = cursor.peek();
	if (p?.kind === 'node' && p.node.name === 'Group') {
		cursor.next();
		call.to = p.to;
		return call;
	}
	const mark = cursor.save();
	for (let q = cursor.peek(); q; q = cursor.peek()) {
		if (q.kind === 'node' && q.node.name === 'ParBreak') break;
		if (q.kind === 'word') {
			const at = im.src.indexOf(';', q.from);
			if (at >= 0 && at < q.to) {
				while (cursor.pos <= at) cursor.nextChar();
				call.to = at + 1;
				return call;
			}
		}
		cursor.next();
	}
	cursor.restore(mark);
	return call;
}

function takesName(arg: Argument): boolean {
	return rolesOf(arg).some((r) => (FILE_ROLES as Role[]).includes(r));
}

/** \input name.tex: TeX's file name runs to a space */
function withBareName(im: TreeImport, cursor: PieceCursor, call: TreeCall, signature: readonly Argument[]): TreeCall {
	const i = call.args.length - 1;
	const arg = call.args[i];
	if (!arg?.present || arg.braced || arg.kind !== 'm' || !takesName(signature[i])) return call;
	let to = arg.to;
	for (let p = cursor.peek(); p?.kind === 'word' && p.from === to && !/[{}%\\]/.test(im.src[p.from]); p = cursor.peek())
		to = cursor.next()!.to;
	const named: TreeArg = { ...arg, to, body: { ...arg.body!, to } };
	return { ...call, to: Math.max(call.to, to), args: [...call.args.slice(0, i), named] };
}

/** reads the command at `piece`, the cursor just past it; `known`: the converter reads it itself */
export function readImportCall(im: TreeImport, cursor: PieceCursor, piece: Piece, known: (name: string) => boolean): ImportCall {
	const name = commandName(im, piece);
	if (DEF_LIKE.has(name)) return defCall(im, cursor, piece, name) ?? { ...readCall(cursor, piece, name, []) };
	if (LET_LIKE.has(name)) return letCall(im, cursor, piece, name) ?? { ...readCall(cursor, piece, name, []) };
	const delim = im.delimited.get(name);
	if (delim) {
		const call = delimitedCall(im, cursor, piece, name, delim);
		if (call) return call;
	}
	if (name === 'tikz') return tikzCall(im, cursor, piece);
	const letters = /^[a-zA-Z@]+$/.test(name);
	if (letters && !im.readings.tableKnows(name) && !known(name) && !ignoredMacros.has(name) && !isScopedSwitch(name)) {
		const call = commentedCall(im, cursor, piece, name);
		if (call) return call;
	}
	const signature = im.readings.argumentsOf(name) ?? [];
	// an argument that is a command the loaded files know takes its call, as their arguments are read first
	const call = readCall(cursor, piece, name, signature, (inner, command) =>
		im.readings.tableKnows(commandName(im, command)) ? readImportCall(im, inner, command, known).to : command.to
	);
	return withBareName(im, cursor, call, signature);
}
