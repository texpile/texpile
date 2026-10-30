import type { FigureDimension, PointRef } from '../../figure/figureLanguage';
import { BP_PER_CM } from '../../figure/lengthUnits';
import type { FigureEditorState } from '../editorState.svelte';
import type { DimensionPlacement, DimensionPoint, DimensionTarget, SegmentTarget } from './dimensionTargets.types';

/** what a written dimension measures and where it sits, to type its value again */
export function dimensionTargetOf(
	ed: FigureEditorState,
	d: FigureDimension
): { target: DimensionTarget; placement: DimensionPlacement } | null {
	const statements = ed.picture?.statements ?? [];
	function pointOf(ref: PointRef): DimensionPoint | null {
		const st = statements.find((s) => s.i === ref.stmt);
		return st ? { i: st.i, points: ed.language.pathPoints(ed.source, st), k: ref.k, m: ed.render.transformOf(st.i) } : null;
	}
	function segmentOf([a, b]: [PointRef, PointRef]): SegmentTarget | null {
		const p = pointOf(a);
		return p && a.stmt === b.stmt ? { kind: 'length', i: p.i, points: p.points, a: a.k, b: b.k, m: p.m } : null;
	}
	if (d.kind === 'angle') {
		const [from, to] = d.lines.map(segmentOf);
		return from && to
			? { target: { kind: 'angle', from, to }, placement: { orient: 'angle', rays: d.rays, radius: d.radius * BP_PER_CM } }
			: null;
	}
	if (d.kind === 'radius') {
		const center = pointOf(d.center);
		const st = center && statements.find((s) => s.i === center.i);
		const radius = st && ed.language.radii(ed.source, st).find((r) => r.centerPoint === center.k);
		return center && radius
			? { target: { kind: 'radius', i: center.i, radius, m: center.m }, placement: { orient: 'radius', angle: d.angle } }
			: null;
	}
	if (d.kind === 'node') {
		const st = statements.find((s) => s.i === d.stmt);
		const box = ed.snapBoxes.find((b) => b.stmt === d.stmt);
		if (!st || !box) return null;
		const round = ed.language.readNodeBox(ed.source, st)?.shape === 'circle';
		return { target: { kind: 'node', i: st.i, st, box, round }, placement: { orient: d.axis, side: d.side, offset: d.offset * BP_PER_CM } };
	}
	const [from, to] = [pointOf(d.from), pointOf(d.to)];
	return from && to ? { target: { kind: 'distance', from, to }, placement: { orient: d.kind, offset: d.offset * BP_PER_CM } } : null;
}
