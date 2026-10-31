import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writePair } from '../coordinates';
import { pictureAround, readPicture, type CetzCall, type CetzStatement } from '../picture';
import { readPair } from '../syntax';
import { shiftStatement, statementMovable } from './statementMoves';

const DEG = Math.PI / 180;

/** the angle above -180, up to 180 */
function normalized(degrees: number) {
	const a = ((degrees % 360) + 360) % 360;
	const b = a > 180 ? a - 360 : a;
	return Math.abs(b) < 1e-6 ? 0 : b;
}

function rotated([x, y]: Point, [cx, cy]: Point, degrees: number): Point {
	const [c, s] = [Math.cos(degrees * DEG), Math.sin(degrees * DEG)];
	return [cx + c * (x - cx) - s * (y - cy), cy + s * (x - cx) + c * (y - cy)];
}

/** what turns as a whole: a shape, a node or a group the canvas can move */
function turnable(source: string, st: CetzStatement) {
	return (st.kind === 'path' || st.kind === 'node' || st.kind === 'scope') && statementMovable(source, st);
}

/** text's own `angle`, in degrees */
export function angleOf(source: string, call: CetzCall) {
	const a = call.args.find((x) => x.name === 'angle');
	const m = a && /^(-?\d+(?:\.\d+)?)deg$/.exec(source.slice(a.value.from, a.value.to));
	return m ? Number(m[1]) : 0;
}

/** the text's own `angle`, set, or taken off at none */
function withAngle(source: string, call: CetzCall, degrees: number) {
	const k = call.args.findIndex((x) => x.name === 'angle');
	const value = `${formatNumber(degrees)}deg`;
	if (k >= 0 && degrees) return source.slice(0, call.args[k].value.from) + value + source.slice(call.args[k].value.to);
	if (k >= 0)
		return source.slice(0, call.args[k - 1]?.to ?? call.args[k].from) + source.slice(k > 0 ? call.args[k].to : call.args[k + 1].from);
	return degrees ? `${source.slice(0, call.args.at(-1)!.to)}, angle: ${value}${source.slice(call.args.at(-1)!.to)}` : source;
}

/** how far it is turned, in degrees: its turn, or text alone its own `angle`; null for what does not turn */
export function readRotation(source: string, st: CetzStatement) {
	if (!turnable(source, st)) return null;
	if (st.turn) return normalized(st.turn.degrees);
	return st.kind === 'node' && !st.text ? normalized(angleOf(source, st)) : 0;
}

function reread(source: string, st: CetzStatement, index: number) {
	return readPicture(source, index)?.statements.find((s) => s.i === st.i) ?? null;
}

/** text alone turned in place by its `angle`, and carried round the center when it is at a point */
function turnText(source: string, st: CetzStatement, center: Point, degrees: number, index: number) {
	const at = st.args.find((a) => !a.name);
	const p = at && readPair(source.slice(at.value.from, at.value.to));
	const to = p ? rotated(p, center, degrees) : null;
	const moved = p && to ? shiftStatement(source, st, to[0] - p[0], to[1] - p[1]) : source;
	const now = reread(moved, st, index);
	return now && withAngle(moved, now, normalized(angleOf(source, st) + degrees));
}

/** the turn written in its place, first in the group or the scope wrapping the statement */
function writeTurn(source: string, st: CetzStatement, prefix: string, degrees: number, pivot: Point) {
	const call = `${prefix}rotate(${formatNumber(degrees)}deg, origin: ${writePair(pivot)})`;
	if (st.turn) return source.slice(0, st.turn.call.from) + call + source.slice(st.turn.call.to);
	if (st.kind !== 'scope')
		return `${source.slice(0, st.from)}${prefix}scope({ ${call}; ${source.slice(st.from, st.to)} })${source.slice(st.to)}`;
	const block = st.args.find((a) => !a.name && source[a.value.from] === '{')!;
	return `${source.slice(0, block.value.from + 1)} ${call};${source.slice(block.value.from + 1)}`;
}

/** the turn taken off: the scope wrapping the statement, or the rotate first in its group */
function withoutTurn(source: string, st: CetzStatement) {
	if (!st.turn) return source;
	if (st.kind !== 'scope') return source.slice(0, st.from) + source.slice(st.inner.from, st.inner.to) + source.slice(st.to);
	const after = /^\s*;?[ \t]*/.exec(source.slice(st.turn.call.to))![0];
	return source.slice(0, st.turn.call.from) + source.slice(st.turn.call.to + after.length);
}

/**
 * Turned by `degrees` about `center`, in the coordinates the statement starts in: a shape, a node or a group by a
 * `rotate` first in the scope it is wrapped in or in itself, the turns it already has made one; text alone by its
 * `angle`. Null for what does not turn
 */
export function rotateStatement(source: string, st: CetzStatement, center: Point, degrees: number) {
	const around = pictureAround(source, st);
	if (!turnable(source, st) || !around) return null;
	if (st.kind === 'node' && !st.text && !st.turn) return turnText(source, st, center, degrees, around.index);
	const [a, c]: [number, Point] = st.turn ? [st.turn.degrees, st.turn.origin] : [0, center];
	const angle = normalized(a + degrees);
	// the turn about `center` after the one about `c` is one turn about another point, where both leave the origin
	const target = rotated(rotated([0, 0], c, a), center, degrees);
	let text: string;
	if (!angle) {
		// whole turns leave a shift, which the points take
		const plain = withoutTurn(source, st);
		const now = reread(plain, st, around.index);
		text = now && (target[0] || target[1]) ? shiftStatement(plain, now, target[0], target[1]) : plain;
	} else {
		const [cos, sin] = [Math.cos(angle * DEG), Math.sin(angle * DEG)];
		const det = (1 - cos) ** 2 + sin ** 2;
		const [tx, ty] = target;
		const pivot: Point = [((1 - cos) * tx - sin * ty) / det, (sin * tx + (1 - cos) * ty) / det];
		text = writeTurn(source, st, around.picture.prefix, angle, pivot);
	}
	// a node's text turns with its outline
	const now = st.text ? reread(text, st, around.index) : null;
	return now?.text ? withAngle(text, now.text, angle) : text;
}
