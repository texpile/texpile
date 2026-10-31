import type { NodeShape } from '$lib/draw/editor/figure/figureLanguage';
import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writePair } from '../coordinates';
import { holdsText, namedArg, type CetzStatement } from '../picture';
import { readNumber, readPair } from '../syntax';

/** the outlines CeTZ draws a node's text in: TikZ's, but for the cylinder, which it has no shape for */
export const CETZ_NODE_SHAPES: NodeShape[] = ['rectangle', 'rounded', 'terminal', 'circle', 'ellipse', 'diamond', 'slant'];

/** an outline's box: its middle and size, and the node shape it draws, null for one of its own */
export type OutlineBox = { shape: NodeShape | null; center: Point; w: number; h: number };

// a slanted input or output leans as TikZ's trapezium at 70 degrees does
const SLANT = 1 / Math.tan((70 * Math.PI) / 180);
const ROUNDED = 0.2;
const EPS = 1e-6;

function near(a: number, b: number) {
	return Math.abs(a - b) < 1e-3;
}

function boxOf(points: Point[]) {
	const xs = points.map((p) => p[0]);
	const ys = points.map((p) => p[1]);
	const [x1, x2, y1, y2] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
	return { center: [(x1 + x2) / 2, (y1 + y2) / 2] as Point, w: x2 - x1, h: y2 - y1, x1, x2, y1, y2 };
}

/** four corners a diamond's: the middle of each side of their box */
function isDiamond(points: Point[]) {
	const b = boxOf(points);
	const tips: Point[] = [
		[b.center[0], b.y2],
		[b.x2, b.center[1]],
		[b.center[0], b.y1],
		[b.x1, b.center[1]]
	];
	return points.length === 4 && tips.every((t) => points.some((p) => near(p[0], t[0]) && near(p[1], t[1])));
}

/** four corners leaning right as TikZ's slant does: flat at the top and bottom, each shifted by the same amount */
function isSlant(points: Point[]) {
	if (points.length !== 4) return false;
	const b = boxOf(points);
	const bottom = points.filter((p) => near(p[1], b.y1)).map((p) => p[0]);
	const top = points.filter((p) => near(p[1], b.y2)).map((p) => p[0]);
	if (bottom.length !== 2 || top.length !== 2) return false;
	return near(Math.min(...bottom), b.x1) && near(Math.max(...top), b.x2) && near(Math.max(...bottom) - b.x1, b.x2 - Math.min(...top));
}

/** an outline's points as written: plain, or placed from another element's anchor, `(rel: (1, 0), to: "a.east")`,
 *  each after it written from the one before; `to` is the anchor a placed outline is measured from */
export function outlinePoints(source: string, st: CetzStatement): { points: Point[]; to: string | null } | null {
	const args = st.args.filter((a) => !a.name);
	const placed = holdsText(st.command) ? args.slice(0, -1) : args;
	if (!placed.length) return null;
	const points: Point[] = [];
	let to: string | null = null;
	for (const [k, a] of placed.entries()) {
		const text = source.slice(a.value.from, a.value.to);
		const plain = readPair(text);
		const rel = /^\(\s*rel\s*:\s*(\([^()]*\))\s*(?:,\s*to\s*:\s*("[^"]*"))?\s*\)$/.exec(text);
		const by = rel && readPair(rel[1]);
		if (plain && !to) points.push(plain);
		else if (by && k === 0 && rel![2]) [to, points[0]] = [rel![2], by];
		else if (by && k > 0 && !rel![2]) points.push([points[k - 1][0] + by[0], points[k - 1][1] + by[1]]);
		else return null;
	}
	return { points, to };
}

/** the box of an outline with these points, and the node shape it draws */
export function outlineOf(command: string, points: Point[], radius: string | null): OutlineBox | null {
	if (command === 'rect' && points.length === 2) {
		const b = boxOf(points);
		const r = radius === null ? 0 : readNumber(radius);
		if (r === null) return { ...b, shape: null };
		return { ...b, shape: !r ? 'rectangle' : r >= Math.min(b.w, b.h) / 2 - EPS ? 'terminal' : 'rounded' };
	}
	// a state is a circle, its radius its own unless it is given one
	if (command === 'finite-state' && points.length === 1)
		return { shape: 'circle', center: points[0], w: 2 * (readNumber(radius ?? '') ?? 0.6), h: 2 * (readNumber(radius ?? '') ?? 0.6) };
	if (command === 'circle' && points.length === 1 && radius !== null) {
		const r = readNumber(radius);
		const pair = r === null ? readPair(radius) : null;
		if (r !== null) return { shape: 'circle', center: points[0], w: 2 * r, h: 2 * r };
		return pair ? { shape: 'ellipse', center: points[0], w: 2 * pair[0], h: 2 * pair[1] } : null;
	}
	if (command !== 'line' || points.length < 3) return null;
	return { ...boxOf(points), shape: isDiamond(points) ? 'diamond' : isSlant(points) ? 'slant' : null };
}

/** the outline's box, in the coordinates of the anchor it is placed from when it is placed */
export function readOutline(source: string, st: CetzStatement): OutlineBox | null {
	const at = outlinePoints(source, st);
	return at && outlineOf(st.command, at.points, namedArg(source, st, 'radius')?.text ?? null);
}

/** the arguments that make an outline what it is, which another outline does not take */
export function isGeometryArg(arg: { name: string | null }) {
	return !arg.name || arg.name === 'radius' || arg.name === 'close';
}

function closedLine(...points: Point[]) {
	return `${points.map(writePair).join(', ')}, close: true`;
}

/** the call drawing `shape` in the box, before `rest`, its style and name */
export function outlineCall(prefix: string, shape: NodeShape, [cx, cy]: Point, w: number, h: number, rest: string[]) {
	const [x1, x2, y1, y2] = [cx - w / 2, cx + w / 2, cy - h / 2, cy + h / 2];
	const n = formatNumber;
	const corners = `${writePair([x1, y1])}, ${writePair([x2, y2])}`;
	const s = SLANT * h;
	const geometry: Record<NodeShape, [string, string]> = {
		rectangle: ['rect', corners],
		rounded: ['rect', `${corners}, radius: ${n(Math.min(ROUNDED, w / 2, h / 2))}`],
		terminal: ['rect', `${corners}, radius: ${n(Math.min(w, h) / 2)}`],
		circle: ['circle', `${writePair([cx, cy])}, radius: ${n(Math.max(w, h) / 2)}`],
		ellipse: ['circle', `${writePair([cx, cy])}, radius: (${n(w / 2)}, ${n(h / 2)})`],
		diamond: ['line', closedLine([cx, y2], [x2, cy], [cx, y1], [x1, cy])],
		slant: ['line', closedLine([x1, y1], [x2 - s, y1], [x2, y2], [x1 + s, y2])],
		cylinder: ['rect', corners]
	};
	const [command, args] = geometry[shape];
	return `${prefix}${command}(${[args, ...rest].join(', ')})`;
}
