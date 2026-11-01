import type { FigurePicture, FigureStatement, StatementKind } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { closingBracket, readPair, splitArgs, splitStatements, type Arg } from './syntax';

/** the name without `draw.` or `cetz.draw.` ('' when not a call, then `open` and `close` are -1) */
export type CetzCall = { from: number; to: number; command: string; open: number; close: number; args: Arg[] };

export type CetzTurn = { degrees: number; origin: Point; call: CetzCall };

export type CetzStatement = FigureStatement &
	CetzCall & {
		/** a node's text (a `content` on its outline by name) or a connector's label along it; null for none */
		text: CetzCall | null;
		/** the statement's own text, without the scope a turn wraps it in */
		inner: { from: number; to: number };
		turn: CetzTurn | null;
		inScope: boolean;
	};

export type CetzPicture = FigurePicture<CetzStatement> & {
	bodyFrom: number;
	endFrom: number;
	prefix: string;
};

const PATHS = new Set([
	'line',
	'rect',
	'circle',
	'arc',
	'bezier',
	'bezier-through',
	'catmull',
	'hobby',
	'grid',
	'polygon',
	'n-star',
	'mark',
	'texpile-dimension',
	'brace',
	'flat-brace',
	'coil',
	'zigzag',
	'wave',
	'angle',
	'right-angle'
]);
const SCOPES = new Set(['group', 'scope', 'on-layer']);
const OUTLINES = new Set(['rect', 'circle', 'polygon', 'n-star', 'line']);
// the package may be imported under any name: `c.draw.line` after `#import "@preview/cetz:..." as c`
const CALL = /^((?:cetz\.)?(?:draw\.|decorations\.|angle\.)?|[A-Za-z_][\w-]*\.draw\.)([A-Za-z_][\w-]*)\s*\(/;

function kindOf(command: string, text: string, args: Arg[], source: string): StatementKind {
	if (/^for\b/.test(text)) return 'foreach';
	if (SCOPES.has(command)) return 'scope';
	if (holdsText(command)) return 'node';
	if (!PATHS.has(command)) return 'other';
	function named(n: string) {
		return args.find((a) => a.name === n);
	}
	const stroke = named('stroke');
	if (command === 'rect' && stroke && source.slice(stroke.value.from, stroke.value.to) === 'none' && !named('fill')) return 'frame';
	return 'path';
}

export function holdsText(command: string) {
	return command === 'content' || command === 'finite-state';
}

function blockArg(source: string, args: Arg[]) {
	return args.find((a) => !a.name && source[a.value.from] === '{') ?? null;
}

function readCall(source: string, span: { from: number; to: number }): CetzCall {
	const call = CALL.exec(source.slice(span.from, span.to));
	const open = call ? span.from + call[0].length - 1 : -1;
	const close = call ? closingBracket(source, open) : -1;
	if (close < 0) return { ...span, command: '', open: -1, close: -1, args: [] };
	// finite's calls keep their package in their name, as Typst has a `state` of its own
	const command = call![1] === 'finite.draw.' ? `finite-${call![2]}` : call![2];
	return { ...span, command, open, close, args: splitArgs(source, open, close) };
}

function argText(source: string, call: CetzCall, name: string | null, k = 0) {
	const a = name ? call.args.find((x) => x.name === name) : call.args.filter((x) => !x.name)[k];
	return a ? source.slice(a.value.from, a.value.to) : null;
}

function textHost(source: string, call: CetzCall) {
	const name = /^"([^".]+)"$/.exec(argText(source, call, 'name') ?? '')?.[1];
	if (!name) return null;
	const closed = call.command === 'line' ? argText(source, call, 'close') === 'true' : OUTLINES.has(call.command);
	if (closed) return { name, along: false };
	return call.command === 'line' || call.command === 'bezier' ? { name, along: true } : null;
}

function isTextOn(source: string, call: CetzCall, host: { name: string; along: boolean }) {
	const at = argText(source, call, null);
	const placed = host.along ? new RegExp(`^"${host.name}\\.(\\d+(\\.\\d+)?%|start|mid|end)"$`).test(at ?? '') : at === `"${host.name}"`;
	return call.command === 'content' && placed && call.args.filter((a) => !a.name).length === 2;
}

type Piece = { call: CetzCall; text: CetzCall | null };

function piecesOf(source: string, from: number, to: number) {
	const calls = splitStatements(source, from, to).map((span) => readCall(source, span));
	const out: Piece[] = [];
	for (let k = 0; k < calls.length; k++) {
		const host = textHost(source, calls[k]);
		const text = host && calls[k + 1] && isTextOn(source, calls[k + 1], host) ? calls[k + 1] : null;
		out.push({ call: calls[k], text });
		if (text) k++;
	}
	return out;
}

function readTurn(source: string, call: CetzCall): CetzTurn | null {
	if (call.command !== 'rotate' || call.args.length > 2 || call.args.some((a) => a.name && a.name !== 'origin')) return null;
	const degrees = /^(-?\d+(?:\.\d+)?)deg$/.exec(argText(source, call, null) ?? '');
	const origin = argText(source, call, 'origin');
	const at: Point | null = origin === null ? [0, 0] : readPair(origin);
	return degrees && at ? { degrees: Number(degrees[1]), origin: at, call } : null;
}

export function listPictures(source: string) {
	const found: { from: number; to: number }[] = [];
	const name = /^\s*#import\s+"@preview\/cetz:[^"]*"\s+as\s+([A-Za-z_][\w-]*)/m.exec(source)?.[1] ?? 'cetz';
	for (const m of source.matchAll(new RegExp(`(?<![\\w.-])(?:${name}\\.)?canvas\\s*\\(`, 'g'))) {
		const lineStart = source.lastIndexOf('\n', m.index!) + 1;
		const before = source.slice(lineStart, m.index!).replace(/"(?:[^"\\]|\\.)*"/g, '');
		if (before.includes('"') || before.includes('//')) continue;
		if (found.length && m.index! < found.at(-1)!.to) continue;
		const close = closingBracket(source, m.index! + m[0].length - 1);
		if (close > 0) found.push({ from: m.index!, to: close + 1 });
	}
	return found;
}

export function readPicture(source: string, index = 0): CetzPicture | null {
	const extent = listPictures(source)[index];
	if (!extent) return null;
	const open = source.indexOf('(', extent.from);
	const body = blockArg(source, splitArgs(source, open, extent.to - 1));
	if (!body) return null;
	const statements: CetzStatement[] = [];
	function add({ call, text }: Piece, outer: { from: number; to: number } | null, turn: CetzTurn | null, inScope: boolean) {
		const kind =
			text && !textHost(source, call)!.along ? 'node' : kindOf(call.command, source.slice(call.from, call.to), call.args, source);
		const inner = { from: call.from, to: text?.to ?? call.to };
		const span = outer ? { from: outer.from, to: outer.to } : inner;
		const st: CetzStatement = { ...call, ...span, inner, turn, i: statements.length + 1, kind, text, inScope };
		statements.push(st);
		return st;
	}
	function visit(from: number, to: number, inScope: boolean) {
		for (const piece of piecesOf(source, from, to)) {
			const block = SCOPES.has(piece.call.command) ? blockArg(source, piece.call.args) : null;
			const held = block ? piecesOf(source, block.value.from + 1, block.value.to - 1) : [];
			const turn = held.length ? readTurn(source, held[0].call) : null;
			// a scope holding a turn and one statement is that statement, turned
			if (turn && piece.call.command === 'scope' && held.length === 2 && !SCOPES.has(held[1].call.command)) {
				add(held[1], piece.call, turn, inScope);
				continue;
			}
			add(piece, null, turn, inScope);
			if (block) visit(turn ? turn.call.to : block.value.from + 1, block.value.to - 1, true);
		}
	}
	visit(body.value.from + 1, body.value.to - 1, false);
	const imported = statements.some((s) => !s.inScope && /^import\s+(?:[\w-]+\.)?draw\s*:\s*\*/.test(source.slice(s.from, s.to)));
	const prefix = imported ? '' : `${source.slice(extent.from, source.indexOf('canvas', extent.from))}draw.`;
	return { from: extent.from, to: extent.to, bodyFrom: body.value.from + 1, endFrom: body.value.to - 1, statements, prefix };
}

export function statementAt(picture: CetzPicture, pos: number) {
	let found: CetzStatement | null = null;
	for (const st of picture.statements) if (st.from <= pos && pos <= st.to && st.kind !== 'scope') found = st;
	return found;
}

export function namedArg(source: string, st: CetzStatement, name: string) {
	const a = st.args.find((x) => x.name === name);
	return a ? { arg: a, text: source.slice(a.value.from, a.value.to) } : null;
}

export function pictureAround(source: string, st: { from: number; to: number }) {
	const index = listPictures(source).findIndex((p) => p.from <= st.from && st.to <= p.to);
	const picture = index < 0 ? null : readPicture(source, index);
	return picture ? { index, picture } : null;
}
