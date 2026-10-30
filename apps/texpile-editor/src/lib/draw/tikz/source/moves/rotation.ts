import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { absolutePoints } from '../coordinates';
import { readCommandOptions, splitItems, writeCommandOptions, type CommandOptions } from '../options/optionList';
import { listPictures, readPicture, type Statement } from '../picture';
import { partOf } from '../reader/syntaxParts';
import { moveWay, shiftStatement, statementMovable } from './statementMoves';

const NUM = String.raw`(-?\d*\.?\d+)`;
const ROTATE_AROUND = new RegExp(String.raw`^rotate around\s*=\s*\{\s*${NUM}\s*:\s*\(\s*${NUM}\s*,\s*${NUM}\s*\)\s*\}$`);
const ROTATE = new RegExp(String.raw`^rotate\s*=\s*\{?\s*${NUM}\s*\}?$`);
const DEG = Math.PI / 180;

/** a scope's options, or the command's own */
function ownOptions(source: string, st: Statement): CommandOptions | null {
	if (st.kind !== 'scope') return readCommandOptions(source, st);
	const list = partOf(st.parts, 'options');
	if (list)
		return { span: { from: list.from, to: list.to }, insertAt: list.from, items: splitItems(source.slice(list.from + 1, list.to - 1)) };
	return { span: null, insertAt: st.from + '\\begin{scope}'.length, items: [] };
}

/** what turns as a whole: a path, a node or a scope the canvas can move */
function turnable(source: string, st: Statement) {
	// a layer takes no options, so it turns only as its statements do
	return (st.kind === 'path' || st.kind === 'node' || (st.kind === 'scope' && !st.command)) && statementMovable(source, st);
}

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

/** how far it is turned: a path's or a scope's `rotate around` first in its options, a node's `rotate`; null for
 *  what does not turn */
export function readRotation(source: string, st: Statement) {
	if (!turnable(source, st)) return null;
	const items = ownOptions(source, st)?.items ?? [];
	if (st.kind === 'node') {
		const m = items.map((i) => ROTATE.exec(i)).find(Boolean);
		return m ? normalized(Number(m[1])) : 0;
	}
	const m = items.length ? ROTATE_AROUND.exec(items[0]) : null;
	return m ? normalized(Number(m[1])) : 0;
}

/** the same statement in the text after an edit to it, which keeps the number of statements */
function reread(source: string, st: Statement) {
	const k = listPictures(source).findIndex((p) => p.from <= st.from && st.from < p.to);
	return readPicture(source, k)?.statements.find((s) => s.i === st.i) ?? null;
}

/** a node turned in place by its `rotate`, and carried round the center when it is at a point */
function turnNode(source: string, st: Statement, center: Point, degrees: number) {
	const at = moveWay(source, st) === 'points' ? absolutePoints(source, st)[0] : null;
	const to = at ? rotated([at.x, at.y], center, degrees) : null;
	const moved = at && to ? shiftStatement(source, st, to[0] - at.x, to[1] - at.y) : source;
	const now = reread(moved, st);
	const options = now && readCommandOptions(moved, now);
	if (!options) return null;
	const k = options.items.findIndex((i) => ROTATE.test(i));
	const angle = normalized((k < 0 ? 0 : Number(ROTATE.exec(options.items[k])![1])) + degrees);
	const items = options.items.filter((_, n) => n !== k);
	return writeCommandOptions(moved, options, angle ? [...items, `rotate=${formatNumber(angle)}`] : items);
}

/**
 * Turned by `degrees` about `center`, in the coordinates the statement starts in: a path or a scope by a `rotate around`
 * first in its options, the turns it already has made one; a node by its `rotate`. Null for what does not turn
 */
export function rotateStatement(source: string, st: Statement, center: Point, degrees: number) {
	if (!turnable(source, st)) return null;
	if (st.kind === 'node') return turnNode(source, st, center, degrees);
	const options = ownOptions(source, st);
	if (!options) return null;
	const m = options.items.length ? ROTATE_AROUND.exec(options.items[0]) : null;
	const rest = m ? options.items.slice(1) : options.items;
	const [a, c]: [number, Point] = m ? [Number(m[1]), [Number(m[2]), Number(m[3])]] : [0, center];
	const angle = normalized(a + degrees);
	// the turn about `center` after the one about `c` is one turn about another point, where both leave it
	const target = rotated(rotated([0, 0], c, a), center, degrees);
	if (!angle) {
		// whole turns leave a shift, which the points take
		const plain = writeCommandOptions(source, options, rest);
		return target[0] || target[1] ? shiftStatement(plain, reread(plain, st) ?? st, target[0], target[1]) : plain;
	}
	const [cos, sin] = [Math.cos(angle * DEG), Math.sin(angle * DEG)];
	// the point p it turns about is where the origin lands: target = (I - R) p
	const det = (1 - cos) ** 2 + sin ** 2;
	const [tx, ty] = target;
	const pivot: Point = [((1 - cos) * tx - sin * ty) / det, (sin * tx + (1 - cos) * ty) / det];
	const key = `rotate around={${formatNumber(angle)}:(${formatNumber(pivot[0])},${formatNumber(pivot[1])})}`;
	return writeCommandOptions(source, options, [key, ...rest]);
}
