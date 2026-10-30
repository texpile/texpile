import type { DimensionHit, DimensionTarget } from './dimensionTargets.types';
import { lineCross } from './geometry/angleGeometry';

/** what a pick is, to find it again when it is clicked once more */
export function pickKey(h: DimensionHit) {
	if ('point' in h) return `p${h.point.i}:${h.point.k}`;
	const t = h.target;
	if (t.kind === 'length' || t.kind === 'side') return `${t.kind}${t.i}:${t.a}:${t.b}`;
	if (t.kind === 'radius') return `r${t.i}:${t.radius.from}`;
	return `${t.kind}${'i' in t ? t.i : ''}`;
}

/** what the picks measure, as FreeCAD's Dimension tool makes it from what is selected: a line its length, two points
 *  their distance, two lines their angle, a circle its radius, a node its size; null until the picks make one */
export function measuredBy(picks: DimensionHit[]): DimensionTarget | null {
	const targets = picks.flatMap((p) => ('target' in p ? [p.target] : []));
	const points = picks.flatMap((p) => ('point' in p ? [p.point] : []));
	if (picks.length === 1 && targets.length === 1) return targets[0];
	if (points.length === 2 && picks.length === 2) return { kind: 'distance', from: points[0], to: points[1] };
	const [first, second] = targets;
	if (targets.length === 2 && picks.length === 2 && first.kind === 'length' && second.kind === 'length' && lineCross(first, second))
		return { kind: 'angle', from: first, to: second };
	return null;
}
