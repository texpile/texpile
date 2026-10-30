import type { Point } from '../../figure/geometry';
import type { DimensionPlacement, DimensionTarget } from '../../state/dimension/dimensionTargets.types';
import { angleParts, type AngleParts } from '../../state/dimension/geometry/angleGeometry';
import { dimensionEnds } from '../../state/dimension/geometry/dimensionGeometry';

const OFFSET_PX = 18;
const OVERSHOOT_PX = 4;
const ARROW_PX = 7;
const ARC_STEPS = 24;

export type DimensionDrawing = { lines: [Point, Point][]; arrows: Point[][]; label: Point };

function arrowAt(tip: Point, [dx, dy]: Point, size: number): Point[] {
	const [bx, by] = [tip[0] - dx * size, tip[1] - dy * size];
	const [nx, ny] = [-dy * size * 0.35, dx * size * 0.35];
	return [tip, [bx + nx, by + ny], [bx - nx, by - ny]];
}

function direction(p: Point, q: Point): Point {
	const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
	return [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
}

/** the dimension line from `a` to `b`, an arrow at each end, with extension lines out to it from `p` and `q` */
function withExtensions(p: Point, q: Point, a: Point, b: Point, scale: number): DimensionDrawing {
	function past(from: Point, to: Point): Point {
		const d = direction(from, to);
		return [to[0] + (d[0] * OVERSHOOT_PX) / scale, to[1] + (d[1] * OVERSHOOT_PX) / scale];
	}
	const dir = direction(a, b);
	const arrow = ARROW_PX / scale;
	return {
		lines: [
			[p, past(p, a)],
			[q, past(q, b)],
			[a, b]
		],
		arrows: [arrowAt(a, [-dir[0], -dir[1]], arrow), arrowAt(b, dir, arrow)],
		label: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
	};
}

/** a radius as CAD draws it, in bp: one line out from the center, its arrow on the rim, its value past it */
function radiusDrawing(center: Point, rim: Point, scale: number): DimensionDrawing {
	const dir = direction(center, rim);
	const out = (OFFSET_PX * 2.2) / scale;
	return { lines: [[center, rim]], arrows: [arrowAt(rim, dir, ARROW_PX / scale)], label: [rim[0] + dir[0] * out, rim[1] + dir[1] * out] };
}

/** an angle as CAD draws it, in bp: an arc from the first way round to the second, an arrow at each end */
function angleDrawing({ cross, ways: [u, v] }: AngleParts, radius: number, scale: number): DimensionDrawing {
	const start = Math.atan2(u[1], u[0]);
	const between = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]);
	function at(k: number): Point {
		const a = start + (between * k) / ARC_STEPS;
		return [cross[0] + radius * Math.cos(a), cross[1] + radius * Math.sin(a)];
	}
	// the arc's way at its step k, onward or back along it
	function tangent(k: number, way: number): Point {
		const a = start + (between * k) / ARC_STEPS + (Math.sign(between) * way * Math.PI) / 2;
		return [Math.cos(a), Math.sin(a)];
	}
	const mid = start + between / 2;
	const out = radius + 22 / scale;
	return {
		lines: Array.from({ length: ARC_STEPS }, (_, k): [Point, Point] => [at(k), at(k + 1)]),
		arrows: [arrowAt(at(0), tangent(0, -1), ARROW_PX / scale), arrowAt(at(ARC_STEPS), tangent(ARC_STEPS, 1), ARROW_PX / scale)],
		label: [cross[0] + out * Math.cos(mid), cross[1] + out * Math.sin(mid)]
	};
}

/** the dimension as it is put, in bp: along what it measures `offset` off it, across or up, round an angle, or out
 *  along a radius */
export function dimensionDrawing(t: DimensionTarget, placed: DimensionPlacement, scale: number): DimensionDrawing | null {
	if (placed.orient === 'angle') {
		const parts = t.kind === 'angle' ? angleParts(t.from, t.to, placed.rays) : null;
		return parts && angleDrawing(parts, placed.radius, scale);
	}
	const [p, q] = dimensionEnds(t, placed);
	if (placed.orient === 'radius') return radiusDrawing(p, q, scale);
	const across = t.kind === 'side' ? t.axis : placed.orient;
	const o = placed.offset;
	if (across === 'x') return withExtensions(p, q, [p[0], p[1] + o], [q[0], p[1] + o], scale);
	if (across === 'y') return withExtensions(p, q, [p[0] + o, p[1]], [p[0] + o, q[1]], scale);
	const [dx, dy] = direction(p, q);
	return withExtensions(p, q, [p[0] - dy * o, p[1] + dx * o], [q[0] - dy * o, q[1] + dx * o], scale);
}

/** a length beside a shape being drawn, in bp: off it on the side away from `inside`, `clearance` further for a shape
 *  that reaches past the points */
export function linearDrawing(p: Point, q: Point, inside: Point | null, scale: number, clearance = 0): DimensionDrawing {
	const [dx, dy] = direction(p, q);
	const mid: Point = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
	// with nothing to stay clear of, above or to the left
	const away = inside ? (mid[0] - inside[0]) * -dy + (mid[1] - inside[1]) * dx : dx - -dy;
	const o = (away < 0 ? -1 : 1) * (clearance + OFFSET_PX / scale);
	return withExtensions(p, q, [p[0] - dy * o, p[1] + dx * o], [q[0] - dy * o, q[1] + dx * o], scale);
}
