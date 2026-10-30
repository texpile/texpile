import type { FigureDimension } from '../../figure/figureLanguage';
import { BP_PER_CM } from '../../figure/lengthUnits';
import type { DimensionPlacement, DimensionTarget } from './dimensionTargets.types';
import { dimensionValue } from './geometry/dimensionGeometry';

function cm(bp: number) {
	return Number((bp / BP_PER_CM).toFixed(2));
}

/**
 * The dimension as the figure keeps it, by the points it is measured between; null for what cannot be named, an arc's
 * radius or a plot's size. `value` is what it reads once set
 */
export function figureDimension(t: DimensionTarget, placed: DimensionPlacement, value: number): FigureDimension | null {
	if (t.kind === 'angle')
		return placed.orient === 'angle'
			? {
					kind: 'angle',
					lines: [
						[
							{ stmt: t.from.i, k: t.from.a },
							{ stmt: t.from.i, k: t.from.b }
						],
						[
							{ stmt: t.to.i, k: t.to.a },
							{ stmt: t.to.i, k: t.to.b }
						]
					],
					rays: placed.rays,
					radius: cm(placed.radius)
				}
			: null;
	if (t.kind === 'radius') {
		const k = t.radius.centerPoint;
		if (k === undefined || t.angle !== undefined || placed.orient !== 'radius') return null;
		// as long as the radius is once set, in the units it is written in
		const length = t.radius.value * (value / (dimensionValue(t, placed) || 1));
		return { kind: 'radius', center: { stmt: t.i, k }, length, value, angle: Math.round(placed.angle) };
	}
	if (placed.orient === 'angle' || placed.orient === 'radius') return null;
	if (t.kind === 'node')
		return t.st.kind === 'node' && placed.orient !== 'aligned'
			? { kind: 'node', stmt: t.i, axis: placed.orient, side: placed.side ?? 1, offset: cm(placed.offset) }
			: null;
	const kind = t.kind === 'side' ? t.axis : placed.orient;
	if (t.kind === 'distance')
		return { kind, from: { stmt: t.from.i, k: t.from.k }, to: { stmt: t.to.i, k: t.to.k }, offset: cm(placed.offset) };
	return { kind, from: { stmt: t.i, k: t.a }, to: { stmt: t.i, k: t.b }, offset: cm(placed.offset) };
}
