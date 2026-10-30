import type { Point } from '../../figure/geometry';
import type { DrawMode } from './drawModes';

/** a shape as its mode makes it from the points placed, in source units: a box turned by `angle` degrees about its
 *  middle, an ellipse, or the first side of a shape still waiting for its last point */
export type DrawnGeometry =
	| { kind: 'box'; center: Point; w: number; h: number; angle: number }
	| { kind: 'ellipse'; center: Point; rx: number; ry: number; circle: boolean }
	| { kind: 'side'; from: Point; to: Point };

/** `square`: Shift, a square or a circle */
export type DrawnOptions = { square: boolean };

function circleThrough([ax, ay]: Point, [bx, by]: Point, [cx, cy]: Point): { center: Point; r: number } | null {
	const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
	if (Math.abs(d) < 1e-9) return null;
	const [a2, b2, c2] = [ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy];
	const center: Point = [(a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d, (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d];
	return { center, r: Math.hypot(ax - center[0], ay - center[1]) };
}

/** half sizes from the middle to a corner, equal for a square */
function halves([cx, cy]: Point, [x, y]: Point, square: boolean): [number, number] {
	const [w, h] = [Math.abs(x - cx), Math.abs(y - cy)];
	return square ? [Math.max(w, h), Math.max(w, h)] : [w, h];
}

/** one side, then the opposite side's distance from it: the box on that side, turned with it */
function onSide(a: Point, b: Point, c: Point): DrawnGeometry {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const length = Math.hypot(dx, dy) || 1;
	const [nx, ny] = [-dy / length, dx / length];
	const across = (c[0] - a[0]) * nx + (c[1] - a[1]) * ny;
	let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
	// a box turned half a turn is the same box
	if (angle > 90) angle -= 180;
	else if (angle <= -90) angle += 180;
	const center: Point = [(a[0] + b[0]) / 2 + (nx * across) / 2, (a[1] + b[1]) / 2 + (ny * across) / 2];
	return { kind: 'box', center, w: Math.hypot(dx, dy), h: Math.abs(across), angle };
}

export function drawnGeometry(family: 'rect' | 'round', mode: DrawMode, points: Point[], o: DrawnOptions): DrawnGeometry | null {
	const [a, b] = [points[0], points.at(-1)!];
	if (!a) return null;
	if (mode === 'threePoints' || mode === 'circleThreePoints') {
		if (points.length < 3) return { kind: 'side', from: a, to: b };
		if (mode === 'threePoints') return onSide(a, points[1], b);
		const circle = circleThrough(a, points[1], b);
		return circle ? { kind: 'ellipse', center: circle.center, rx: circle.r, ry: circle.r, circle: true } : { kind: 'side', from: a, to: b };
	}
	if (mode === 'circleCenter' || mode === 'circleTwoPoints') {
		const center: Point = mode === 'circleCenter' ? a : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
		const r = Math.hypot(b[0] - center[0], b[1] - center[1]);
		return { kind: 'ellipse', center, rx: r, ry: r, circle: true };
	}
	const center: Point = mode === 'center' ? a : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
	// a drag from a corner is squared as it is pressed, so only a box drawn from its middle squares here
	const [hw, hh] = halves(center, b, o.square && mode === 'center');
	if (family === 'round') return { kind: 'ellipse', center, rx: hw, ry: hh, circle: o.square };
	return { kind: 'box', center, w: 2 * hw, h: 2 * hh, angle: 0 };
}

/** a box's corners, counterclockwise from its first */
export function boxCorners(g: Extract<DrawnGeometry, { kind: 'box' }>): Point[] {
	const t = (g.angle * Math.PI) / 180;
	const [c, s] = [Math.cos(t), Math.sin(t)];
	return [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1]
	].map(([x, y]): Point => {
		const [u, v] = [(x * g.w) / 2, (y * g.h) / 2];
		return [g.center[0] + u * c - v * s, g.center[1] + u * s + v * c];
	});
}
