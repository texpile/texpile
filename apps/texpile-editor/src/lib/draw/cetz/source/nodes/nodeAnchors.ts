import type { Point } from '$lib/draw/editor/figure/geometry';
import { formatNumber } from '$lib/draw/editor/figure/numbers';
import { writtenPoints } from '../coordinates';
import type { CetzStatement } from '../picture';

// TikZ's compass anchors, as the way from a node's middle to the corner or side of its box they name
export const COMPASS: Record<string, Point> = {
	north: [0, 1],
	south: [0, -1],
	east: [1, 0],
	west: [-1, 0],
	'north east': [1, 1],
	'north west': [-1, 1],
	'south east': [1, -1],
	'south west': [-1, -1]
};

/** each compass anchor on a closed line, which CeTZ gives none of: the way round it from its first point, as a
 *  percentage, to the point of it nearest the anchor's place on its box */
function lineAnchors(source: string, st: CetzStatement) {
	const points = writtenPoints(source, st).map((p): Point => [p.x, p.y]);
	if (st.command !== 'line' || points.length < 3) return null;
	const sides = points.map((p, k) => [p, points[(k + 1) % points.length]] as const);
	const lengths = sides.map(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]));
	const total = lengths.reduce((a, b) => a + b, 0);
	const xs = points.map((p) => p[0]);
	const ys = points.map((p) => p[1]);
	const [cx, cy, hw, hh] = [
		(Math.min(...xs) + Math.max(...xs)) / 2,
		(Math.min(...ys) + Math.max(...ys)) / 2,
		(Math.max(...xs) - Math.min(...xs)) / 2,
		(Math.max(...ys) - Math.min(...ys)) / 2
	];
	return Object.entries(COMPASS).map(([anchor, [dx, dy]]) => {
		const [tx, ty] = [cx + dx * hw, cy + dy * hh];
		let best = { d: Infinity, at: 0 };
		let run = 0;
		sides.forEach(([p, q], k) => {
			const [ux, uy] = [q[0] - p[0], q[1] - p[1]];
			const t = lengths[k] ? Math.max(0, Math.min(1, ((tx - p[0]) * ux + (ty - p[1]) * uy) / lengths[k] ** 2)) : 0;
			const d = Math.hypot(p[0] + t * ux - tx, p[1] + t * uy - ty);
			if (d < best.d - 1e-9) best = { d, at: run + t * lengths[k] };
			run += lengths[k];
		});
		return { anchor, percent: `${formatNumber((100 * best.at) / total)}%` };
	});
}

/** a point on a named element, `"n1.north-east"`: CeTZ spells TikZ's anchors with a dash, and on a closed line, which
 *  has none, takes the way round it to the anchor's place */
export function writeElementRef(name: string, anchor: string | null | undefined, on?: { source: string; st: CetzStatement }) {
	const round = anchor && on ? lineAnchors(on.source, on.st)?.find((a) => a.anchor === anchor)?.percent : null;
	const written = round ?? anchor?.replaceAll(' ', '-');
	return `"${name}${written ? `.${written}` : ''}"`;
}

/** the element and the anchor, as TikZ names it, a quoted argument points at; null for any other argument */
export function readElementRef(text: string, on?: { source: string; st: CetzStatement }) {
	const m = /^"([^".]+)(?:\.([^"]+))?"$/.exec(text);
	if (!m) return null;
	// a point of its border, at an angle or round a line, is the border to the editor
	const round = m[2]?.endsWith('%') && on ? (lineAnchors(on.source, on.st)?.find((a) => a.percent === m[2])?.anchor ?? null) : undefined;
	const border = m[2] && (/^-?[\d.]+deg$/.test(m[2]) || (m[2].endsWith('%') && round === null));
	return { name: m[1], anchor: border ? null : (round ?? m[2]?.replaceAll('-', ' ') ?? null) };
}

function turnTo([dx, dy]: Point, degrees: number) {
	const d = Math.abs((((Math.atan2(dy, dx) * 180) / Math.PI - degrees) % 360) + 360) % 360;
	return Math.min(d, 360 - d);
}

/** the way out from a node's middle to the point of its border a reference names, in degrees: an angle as written, or
 *  a closed line's way round it; null for one that names an anchor */
export function borderAngle(text: string, on: { source: string; st: CetzStatement; center: Point }) {
	const turned = /^"[^".]+\.(-?[\d.]+)deg"$/.exec(text);
	if (turned) return Number(turned[1]);
	const round = /^"[^".]+\.([\d.]+)%"$/.exec(text);
	if (!round || on.st.command !== 'line') return null;
	const points = writtenPoints(on.source, on.st).map((p): Point => [p.x, p.y]);
	const legs = points.map((p, k): [Point, Point] => [p, points[(k + 1) % points.length]]);
	let left = (Number(round[1]) / 100) * legs.reduce((sum, [p, q]) => sum + Math.hypot(q[0] - p[0], q[1] - p[1]), 0);
	for (const [p, q] of legs) {
		const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
		if (left <= length && length > 0) {
			const [x, y] = [p[0] + ((q[0] - p[0]) * left) / length, p[1] + ((q[1] - p[1]) * left) / length];
			return (Math.atan2(y - on.center[1], x - on.center[0]) * 180) / Math.PI;
		}
		left -= length;
	}
	return null;
}

/** where a closed line's border is met going out from its middle at `degrees`, as the way round it */
function lineBorder(points: Point[], [cx, cy]: Point, degrees: number) {
	const [dx, dy] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
	let run = 0;
	let found: number | null = null;
	const total = points.reduce(
		(sum, p, k) => sum + Math.hypot(points[(k + 1) % points.length][0] - p[0], points[(k + 1) % points.length][1] - p[1]),
		0
	);
	points.forEach((p, k) => {
		const q = points[(k + 1) % points.length];
		const [ex, ey] = [q[0] - p[0], q[1] - p[1]];
		const length = Math.hypot(ex, ey);
		// c + s d = p + t e
		const det = ex * dy - dx * ey;
		const [wx, wy] = [p[0] - cx, p[1] - cy];
		if (found === null && Math.abs(det) > 1e-12) {
			const t = (dx * wy - dy * wx) / det;
			const s = (ex * wy - ey * wx) / det;
			if (t >= 0 && t <= 1 && s > 0) found = run + t * length;
		}
		run += length;
	});
	return found === null ? null : `${formatNumber((100 * found) / total)}%`;
}

/** the point of an element's border out from its middle at `degrees`: CeTZ finds it on its own outlines, and a closed
 *  line, which it does not, is taken round */
export function writeBorderRef(name: string, degrees: number, on: { source: string; st: CetzStatement; center: Point }) {
	const angle = ((Math.round(degrees) % 360) + 360) % 360;
	// text has no border to meet, only its box's sides and corners: the one nearest the way out
	if (on.st.command === 'content') {
		const nearest = Object.entries(COMPASS).sort(([, a], [, b]) => turnTo(a, angle) - turnTo(b, angle))[0][0];
		return writeElementRef(name, nearest);
	}
	if (on.st.command !== 'line') return `"${name}.${angle}deg"`;
	const round = lineBorder(
		writtenPoints(on.source, on.st).map((p): Point => [p.x, p.y]),
		on.center,
		angle
	);
	return `"${name}${round ? `.${round}` : ''}"`;
}
