import { canvasPoint, sourcePoint, type Point, type SourceTransform } from '../../../figure/geometry';
import { BP_PER_CM } from '../../../figure/lengthUnits';
import type { DimensionPlacement, DimensionPoint, DimensionTarget } from '../dimensionTargets.types';
import { angleDegrees, angleParts } from './angleGeometry';

export function canvasOf(p: DimensionPoint): [number, number] {
	const q = p.points[p.k];
	return canvasPoint(q.x, q.y, p.m);
}

/** the two canvas points a dimension measures between, in bp: a radius from its center out the way it is put, a
 *  node's outline along the side it is put by */
export function dimensionEnds(t: DimensionTarget, placed: DimensionPlacement): [Point, Point] {
	if (t.kind === 'angle') return dimensionEnds(t.to, placed);
	if (t.kind === 'distance') return [canvasOf(t.from), canvasOf(t.to)];
	if (t.kind === 'node') {
		const { x1, y1, x2, y2 } = t.box;
		const side = 'side' in placed ? (placed.side ?? 1) : 1;
		if (placed.orient === 'y')
			return side > 0
				? [
						[x2, y1],
						[x2, y2]
					]
				: [
						[x1, y1],
						[x1, y2]
					];
		return side > 0
			? [
					[x1, y2],
					[x2, y2]
				]
			: [
					[x1, y1],
					[x2, y1]
				];
	}
	if (t.kind === 'radius') {
		const { center, value, axis } = t.radius;
		const a = ((placed.orient === 'radius' ? placed.angle : (t.angle ?? 45)) * Math.PI) / 180;
		const [du, dv] = axis === 'x' ? [value, 0] : axis === 'y' ? [0, value] : [value * Math.cos(a), value * Math.sin(a)];
		return [canvasPoint(center.x, center.y, t.m), canvasPoint(center.x + du, center.y + dv, t.m)];
	}
	const a = t.points[t.a];
	const b = t.points[t.b];
	return [canvasPoint(a.x, a.y, t.m), canvasPoint(b.x, b.y, t.m)];
}

/** the dimension's value as put: along the line, across or up, in cm on the paper; an angle's in degrees */
export function dimensionValue(t: DimensionTarget, placed: DimensionPlacement): number {
	if (t.kind === 'angle') {
		const parts = placed.orient === 'angle' ? angleParts(t.from, t.to, placed.rays) : null;
		return parts ? angleDegrees(parts) : 0;
	}
	const [p, q] = dimensionEnds(t, placed);
	const across = t.kind === 'side' ? t.axis : placed.orient;
	if (across === 'x') return Math.abs(q[0] - p[0]) / BP_PER_CM;
	if (across === 'y') return Math.abs(q[1] - p[1]) / BP_PER_CM;
	return Math.hypot(q[0] - p[0], q[1] - p[1]) / BP_PER_CM;
}

/** the second end moved until the dimension measures `cm`: along the line, or across or up only; in source units */
export function stretchedEnd(p: Point, q: Point, across: 'aligned' | 'x' | 'y', cm: number, m: SourceTransform): [number, number] {
	const to = cm * BP_PER_CM;
	if (across === 'x') return sourcePoint(p[0] + (q[0] < p[0] ? -to : to), q[1], m);
	if (across === 'y') return sourcePoint(q[0], p[1] + (q[1] < p[1] ? -to : to), m);
	const scale = to / (Math.hypot(q[0] - p[0], q[1] - p[1]) || 1);
	return sourcePoint(p[0] + (q[0] - p[0]) * scale, p[1] + (q[1] - p[1]) * scale, m);
}
