export type Point = readonly [number, number];
export type Box = { x1: number; y1: number; x2: number; y2: number };

/** where a statement's coordinates, as written, land on the canvas (bp, y up): x = a u + c v + e, y = b u + d v + f */
export type SourceTransform = readonly [number, number, number, number, number, number];

export const IDENTITY: SourceTransform = [1, 0, 0, 1, 0, 0];

export function canvasPoint(u: number, v: number, m: SourceTransform): [number, number] {
	const [a, b, c, d, e, f] = m;
	return [a * u + c * v + e, b * u + d * v + f];
}

/** a canvas displacement in bp, as source units under the transform */
export function sourceDelta(dx: number, dy: number, m: SourceTransform): [number, number] {
	const [a, b, c, d] = m;
	const det = a * d - b * c || 1;
	return [(d * dx - c * dy) / det, (-b * dx + a * dy) / det];
}

/** how far a point is from the segment between two others */
export function distanceToSegment([x, y]: Point, [ax, ay]: Point, [bx, by]: Point) {
	const [dx, dy] = [bx - ax, by - ay];
	const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
	return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

export function sourcePoint(x: number, y: number, m: SourceTransform): [number, number] {
	return sourceDelta(x - m[4], y - m[5], m);
}

/** a gentle arc between two points: controls at a third and two thirds, pushed off the chord */
export function curveControls(a: Point, b: Point): [Point, Point] {
	const dx = b[0] - a[0];
	const dy = b[1] - a[1];
	const nx = -dy * 0.3;
	const ny = dx * 0.3;
	return [
		[a[0] + dx / 3 + nx, a[1] + dy / 3 + ny],
		[a[0] + (2 * dx) / 3 + nx, a[1] + (2 * dy) / 3 + ny]
	];
}

// Ramer-Douglas-Peucker: a pen stroke keeps only the points that change its shape
export function simplifyStroke(points: Point[], tolerance: number): Point[] {
	if (points.length < 3) return points;
	const [a, b] = [points[0], points[points.length - 1]];
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const len2 = dx * dx + dy * dy;
	let worst = 0;
	let at = 0;
	// distance to the segment, not the line through it: a stroke that doubles back or closes keeps its far points
	for (let i = 1; i < points.length - 1; i++) {
		const p = points[i];
		const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
		const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
		if (d > worst) [worst, at] = [d, i];
	}
	if (worst <= tolerance) return [a, b];
	return [...simplifyStroke(points.slice(0, at + 1), tolerance).slice(0, -1), ...simplifyStroke(points.slice(at), tolerance)];
}
