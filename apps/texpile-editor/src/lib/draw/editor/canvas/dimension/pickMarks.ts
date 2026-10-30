import { canvasPoint, type Point } from '../../figure/geometry';
import type { DimensionHit } from '../../state/dimension/dimensionTargets.types';
import { canvasOf } from '../../state/dimension/geometry/dimensionGeometry';

/** how something picked or under the pointer is outlined, in bp */
export type PickMark = { line: [Point, Point] } | { ring: Point } | { circle: Point; r: number } | { box: [Point, Point] };

export function pickMark(h: DimensionHit): PickMark | null {
	if ('point' in h) return { ring: canvasOf(h.point) };
	const t = h.target;
	if (t.kind === 'length') {
		const [p, q] = [t.points[t.a], t.points[t.b]];
		return { line: [canvasPoint(p.x, p.y, t.m), canvasPoint(q.x, q.y, t.m)] };
	}
	if (t.kind === 'side') {
		const [p, q] = [t.points[t.a], t.points[t.b]];
		return { box: [canvasPoint(p.x, p.y, t.m), canvasPoint(q.x, q.y, t.m)] };
	}
	if (t.kind === 'node')
		return {
			box: [
				[t.box.x1, t.box.y1],
				[t.box.x2, t.box.y2]
			]
		};
	if (t.kind === 'radius') {
		const c = canvasPoint(t.radius.center.x, t.radius.center.y, t.m);
		const rim = canvasPoint(t.radius.center.x + t.radius.value, t.radius.center.y, t.m);
		return { circle: c, r: Math.hypot(rim[0] - c[0], rim[1] - c[1]) };
	}
	return null;
}
