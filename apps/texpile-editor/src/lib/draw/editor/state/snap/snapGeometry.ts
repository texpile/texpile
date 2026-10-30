import type { Point } from '../../figure/geometry';
import type { SnapCircle, SnapSegment } from './snapScene.types';

// shorter segments are arrow tips and the like
const MIN_SEGMENT = 6;

/** a drawn path's straight pieces and the middles of its curves, in bp */
export function pathPieces(d: string) {
	const lines: [Point, Point][] = [];
	const curveMiddles: Point[] = [];
	let start: Point | null = null;
	let at: Point | null = null;
	function line(to: Point) {
		if (at && Math.hypot(to[0] - at[0], to[1] - at[1]) >= MIN_SEGMENT) lines.push([at, to]);
		at = to;
	}
	for (const [, op, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
		const n = args.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
		if (op === 'M') at = start = [n[0], n[1]];
		else if (op === 'L') line([n[0], n[1]]);
		else if (op === 'Z' && start) line(start);
		else if (op === 'C' && at) {
			if (Math.hypot(n[4] - at[0], n[5] - at[1]) >= MIN_SEGMENT)
				curveMiddles.push([(at[0] + 3 * n[0] + 3 * n[2] + n[4]) / 8, (at[1] + 3 * n[1] + 3 * n[3] + n[5]) / 8]);
			at = [n[4], n[5]];
		}
	}
	return { lines, curveMiddles };
}

export function distanceToSegment(p: Point, { a, b }: Pick<SnapSegment, 'a' | 'b'>) {
	const [fx, fy] = footOnLine(p, a, b, true);
	return Math.hypot(p[0] - fx, p[1] - fy);
}

/** where the perpendicular from `p` meets the line through a and b; `clamped` keeps it on the segment */
export function footOnLine(p: Point, a: Point, b: Point, clamped = false): Point {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const t0 = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
	const t = clamped ? Math.min(1, Math.max(0, t0)) : t0;
	return [a[0] + t * dx, a[1] + t * dy];
}

/** whether the foot lies on the segment itself */
export function onSegment(p: Point, { a, b }: Pick<SnapSegment, 'a' | 'b'>) {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
	return t >= -1e-9 && t <= 1 + 1e-9;
}

export function crossSegments(s: Pick<SnapSegment, 'a' | 'b'>, t: Pick<SnapSegment, 'a' | 'b'>): Point | null {
	const [r, q] = [
		[s.b[0] - s.a[0], s.b[1] - s.a[1]],
		[t.b[0] - t.a[0], t.b[1] - t.a[1]]
	];
	const denom = r[0] * q[1] - r[1] * q[0];
	if (Math.abs(denom) < 1e-9) return null;
	const [wx, wy] = [t.a[0] - s.a[0], t.a[1] - s.a[1]];
	const u = (wx * q[1] - wy * q[0]) / denom;
	const v = (wx * r[1] - wy * r[0]) / denom;
	return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [s.a[0] + u * r[0], s.a[1] + u * r[1]] : null;
}

/** where a segment crosses an ellipse square to the axes */
export function crossSegmentEllipse(s: Pick<SnapSegment, 'a' | 'b'>, c: SnapCircle): Point[] {
	// scaled so the ellipse is a unit circle
	const [ax, ay] = [(s.a[0] - c.center[0]) / c.rx, (s.a[1] - c.center[1]) / c.ry];
	const [dx, dy] = [(s.b[0] - s.a[0]) / c.rx, (s.b[1] - s.a[1]) / c.ry];
	const [qa, qb, qc] = [dx * dx + dy * dy, 2 * (ax * dx + ay * dy), ax * ax + ay * ay - 1];
	const disc = qb * qb - 4 * qa * qc;
	if (qa < 1e-12 || disc < 0) return [];
	const roots = [(-qb - Math.sqrt(disc)) / (2 * qa), (-qb + Math.sqrt(disc)) / (2 * qa)];
	return roots.filter((t) => t >= 0 && t <= 1).map((t): Point => [s.a[0] + t * (s.b[0] - s.a[0]), s.a[1] + t * (s.b[1] - s.a[1])]);
}

/** where two circles cross; ellipses are left out */
export function crossCircles(c: SnapCircle, k: SnapCircle): Point[] {
	if (Math.abs(c.rx - c.ry) > 1e-6 || Math.abs(k.rx - k.ry) > 1e-6) return [];
	const [dx, dy] = [k.center[0] - c.center[0], k.center[1] - c.center[1]];
	const d = Math.hypot(dx, dy);
	if (d < 1e-9 || d > c.rx + k.rx || d < Math.abs(c.rx - k.rx)) return [];
	const a = (c.rx * c.rx - k.rx * k.rx + d * d) / (2 * d);
	const h = Math.sqrt(Math.max(0, c.rx * c.rx - a * a));
	const [mx, my] = [c.center[0] + (a * dx) / d, c.center[1] + (a * dy) / d];
	return [
		[mx + (h * dy) / d, my - (h * dx) / d],
		[mx - (h * dy) / d, my + (h * dx) / d]
	];
}

/** how far a point is from an ellipse's outline, roughly: exact for a circle */
export function distanceToOutline([px, py]: Point, c: SnapCircle) {
	const [ux, uy] = [(px - c.center[0]) / c.rx, (py - c.center[1]) / c.ry];
	const k = Math.hypot(ux, uy);
	return Math.abs(k - 1) * Math.min(c.rx, c.ry);
}
