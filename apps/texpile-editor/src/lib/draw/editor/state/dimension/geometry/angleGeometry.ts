import { canvasPoint, type Point } from '../../../figure/geometry';
import type { SegmentTarget } from '../dimensionTargets.types';

/** each segment taken the way from its first point to its second (1) or back (-1) */
export type AngleRays = [1 | -1, 1 | -1];

/** an angle as the canvas has it, in bp: where the lines cross, the way of each from there, and the second segment's
 *  end nearer the crossing (its pivot), its way and length from there to the end that turns, and which point that is */
export type AngleParts = { cross: Point; ways: [Point, Point]; pivot: Point; arm: Point; length: number; turning: number };

function endsOf(t: SegmentTarget): [Point, Point] {
	const [p, q] = [t.points[t.a], t.points[t.b]];
	return [canvasPoint(p.x, p.y, t.m), canvasPoint(q.x, q.y, t.m)];
}

function unit([x, y]: Point): Point {
	const length = Math.hypot(x, y) || 1;
	return [x / length, y / length];
}

/** where the two segments' lines cross; null for lines that do not */
export function lineCross(from: SegmentTarget, to: SegmentTarget): Point | null {
	const [a0, a1] = endsOf(from);
	const [b0, b1] = endsOf(to);
	const [dx, dy] = [a1[0] - a0[0], a1[1] - a0[1]];
	const [ex, ey] = [b1[0] - b0[0], b1[1] - b0[1]];
	const det = dx * ey - dy * ex;
	if (Math.abs(det) < 1e-6 * Math.hypot(dx, dy) * Math.hypot(ex, ey)) return null;
	const s = ((b0[0] - a0[0]) * ey - (b0[1] - a0[1]) * ex) / det;
	return [a0[0] + s * dx, a0[1] + s * dy];
}

export function angleParts(from: SegmentTarget, to: SegmentTarget, rays: AngleRays): AngleParts | null {
	const cross = lineCross(from, to);
	if (!cross) return null;
	const [a0, a1] = endsOf(from);
	const [b0, b1] = endsOf(to);
	const first = unit([a1[0] - a0[0], a1[1] - a0[1]]);
	const second = unit([b1[0] - b0[0], b1[1] - b0[1]]);
	const nearB0 = Math.hypot(b0[0] - cross[0], b0[1] - cross[1]) <= Math.hypot(b1[0] - cross[0], b1[1] - cross[1]);
	const [pivot, end] = nearB0 ? [b0, b1] : [b1, b0];
	return {
		cross,
		ways: [
			[first[0] * rays[0], first[1] * rays[0]],
			[second[0] * rays[1], second[1] * rays[1]]
		],
		pivot,
		arm: unit([end[0] - pivot[0], end[1] - pivot[1]]),
		length: Math.hypot(end[0] - pivot[0], end[1] - pivot[1]),
		turning: nearB0 ? to.b : to.a
	};
}

/** the angle between the two ways, in degrees, 0 to 180 */
export function angleDegrees({ ways: [u, v] }: AngleParts) {
	return (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180) / Math.PI;
}

/** the ways round the crossing that hold the pointer between them, as CAD picks one of the four angles */
export function raysToward(from: SegmentTarget, to: SegmentTarget, at: Point): AngleRays {
	const options: AngleRays[] = [
		[1, 1],
		[1, -1],
		[-1, 1],
		[-1, -1]
	];
	for (const rays of options) {
		const parts = angleParts(from, to, rays);
		if (!parts) break;
		const [u, v] = parts.ways;
		const [cx, cy] = [at[0] - parts.cross[0], at[1] - parts.cross[1]];
		const sweep = u[0] * v[1] - u[1] * v[0];
		// between them: on the second's side of the first, and on the first's side of the second
		if ((u[0] * cy - u[1] * cx) * sweep >= 0 && (cx * v[1] - cy * v[0]) * sweep >= 0) return rays;
	}
	return [1, 1];
}

/** where the turning end goes for the angle to be `degrees`, on the side of the first way it is on now */
export function turnedEnd(parts: AngleParts, degrees: number): Point {
	const { ways, arm, pivot, length } = parts;
	const [u, v] = ways;
	const side = u[0] * v[1] - u[1] * v[0] < 0 ? -1 : 1;
	const a = Math.atan2(u[1], u[0]) + (side * degrees * Math.PI) / 180;
	// the arm runs with the second way or against it, and keeps doing so
	const along = arm[0] * v[0] + arm[1] * v[1] < 0 ? -1 : 1;
	return [pivot[0] + along * length * Math.cos(a), pivot[1] + along * length * Math.sin(a)];
}

// the step the source writes a point to
const WRITTEN_STEP = 0.01;

/** of the points written near `to`, the one whose direction from `pivot` is nearest to `to`'s, so a typed angle is
 *  printed as typed rather than a tenth off */
export function writtenOnDirection(pivot: Point, to: Point): Point {
	const want = Math.atan2(to[1] - pivot[1], to[0] - pivot[0]);
	const [u0, v0] = to.map((c) => Math.round(c / WRITTEN_STEP) * WRITTEN_STEP);
	let best: Point = [u0, v0];
	let off = Infinity;
	for (let i = -3; i <= 3; i++)
		for (let j = -3; j <= 3; j++) {
			const p: Point = [u0 + i * WRITTEN_STEP, v0 + j * WRITTEN_STEP];
			const turn = Math.abs(Math.atan2(p[1] - pivot[1], p[0] - pivot[0]) - want);
			const d = turn + Math.hypot(p[0] - to[0], p[1] - to[1]) * 1e-6;
			if (d < off) [best, off] = [p, d];
		}
	return best;
}
