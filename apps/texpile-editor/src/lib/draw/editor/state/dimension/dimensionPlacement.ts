import type { Point } from '../../figure/geometry';
import type { DimensionPlacement, DimensionTarget } from './dimensionTargets.types';
import { lineCross, raysToward } from './geometry/angleGeometry';
import { dimensionEnds } from './geometry/dimensionGeometry';

/** above or below the span, across; beside it, up; anywhere else, along it, as FreeCAD's Dimension tool reads it */
function zoneOf([p, q]: [Point, Point], [x, y]: Point): 'aligned' | 'x' | 'y' {
	const withinX = x >= Math.min(p[0], q[0]) && x <= Math.max(p[0], q[0]);
	const withinY = y >= Math.min(p[1], q[1]) && y <= Math.max(p[1], q[1]);
	if (withinX && !withinY) return 'x';
	if (withinY && !withinX) return 'y';
	return 'aligned';
}

/** where a dimension goes with the pointer at `at`: what it measures by, and how far off it */
export function placementAt(t: DimensionTarget, at: Point): DimensionPlacement {
	if (t.kind === 'angle') {
		const cross = lineCross(t.from, t.to) ?? at;
		return { orient: 'angle', rays: raysToward(t.from, t.to, at), radius: Math.hypot(at[0] - cross[0], at[1] - cross[1]) };
	}
	if (t.kind === 'radius') {
		const [c] = dimensionEnds(t, { orient: 'radius', angle: 0 });
		return { orient: 'radius', angle: (Math.atan2(at[1] - c[1], at[0] - c[0]) * 180) / Math.PI };
	}
	if (t.kind === 'node') {
		const { x1, y1, x2, y2 } = t.box;
		const beside = (at[0] < x1 || at[0] > x2) && at[1] >= y1 && at[1] <= y2;
		if (beside) return { orient: 'y', side: at[0] > x2 ? 1 : -1, offset: at[0] - (at[0] > x2 ? x2 : x1) };
		const above = at[1] >= (y1 + y2) / 2;
		return { orient: 'x', side: above ? 1 : -1, offset: at[1] - (above ? y2 : y1) };
	}
	const [p, q] = dimensionEnds(t, { orient: 'aligned', offset: 0 });
	const orient = t.kind === 'side' ? t.axis : zoneOf([p, q], at);
	if (orient === 'x') return { orient, offset: at[1] - p[1] };
	if (orient === 'y') return { orient, offset: at[0] - p[0] };
	const length = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
	const normal: Point = [-(q[1] - p[1]) / length, (q[0] - p[0]) / length];
	return { orient, offset: (at[0] - p[0]) * normal[0] + (at[1] - p[1]) * normal[1] };
}
