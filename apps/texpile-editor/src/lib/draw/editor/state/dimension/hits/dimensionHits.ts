import type { ArcSpan, FigureLanguage, FigureStatement, PointSpan, RadiusSpan } from '../../../figure/figureLanguage';
import { canvasPoint, distanceToSegment, sourcePoint, type Point, type SourceTransform } from '../../../figure/geometry';
import type { StatementBox } from '../../snapTargets.types';
import { nodeOutlineHit } from './nodeOutlineHits';
import type { DimensionHit, DimensionTarget } from '../dimensionTargets.types';

/** what the hit test reads of the editor */
export type DimensionScene = {
	language: FigureLanguage;
	source: string;
	statements: FigureStatement[];
	transformOf: (i: number) => SourceTransform;
	/** the nodes with an outline, as TeX drew them */
	outlines: StatementBox[];
};

/** the straight segments and rectangle sides of a path, each with its canvas ends */
function edgesOf(i: number, points: PointSpan[], m: SourceTransform) {
	const out: { target: DimensionTarget; ends: [Point, Point] }[] = [];
	function at(u: number, v: number) {
		return canvasPoint(u, v, m);
	}
	points.forEach((q, b) => {
		const back = q.closedTo === undefined ? null : points[q.closedTo];
		// a `-- cycle` keeps where the path started, and its last point moves
		if (back) out.push({ target: { kind: 'length', i, points, a: q.closedTo!, b, m }, ends: [at(back.x, back.y), at(q.x, q.y)] });
		const p = points[b - 1];
		if (!p || !q.joined) return;
		if (q.joined === 'line') {
			out.push({ target: { kind: 'length', i, points, a: b - 1, b, m }, ends: [at(p.x, p.y), at(q.x, q.y)] });
			return;
		}
		// the two sides across x measure the width, the two across y the height
		for (const v of [p.y, q.y])
			out.push({ target: { kind: 'side', i, points, a: b - 1, b, axis: 'x', m }, ends: [at(p.x, v), at(q.x, v)] });
		for (const u of [p.x, q.x])
			out.push({ target: { kind: 'side', i, points, a: b - 1, b, axis: 'y', m }, ends: [at(u, p.y), at(u, q.y)] });
	});
	return out;
}

/** how far a canvas point is from a circle's or an ellipse's rim, in bp, and the radius it is nearest along */
function nearRim(at: Point, i: number, radii: RadiusSpan[], m: SourceTransform) {
	const out: { target: DimensionTarget; off: number }[] = [];
	const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
	const [u, v] = sourcePoint(...at, m);
	for (const r of radii) {
		const pair = radii.find((o) => o !== r && o.center.x === r.center.x && o.center.y === r.center.y && o.axis !== 'r');
		const [du, dv] = [u - r.center.x, v - r.center.y];
		const [rx, ry] =
			r.axis === 'r' ? [r.value, r.value] : r.axis === 'x' ? [r.value, pair?.value ?? r.value] : [pair?.value ?? r.value, r.value];
		const angle = Math.atan2(dv / ry, du / rx);
		const rim = Math.hypot(rx * Math.cos(angle), ry * Math.sin(angle));
		// an ellipse is measured along the axis the pointer is nearer
		if (r.axis !== 'r' && Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle)) !== (r.axis === 'x')) continue;
		out.push({ target: { kind: 'radius', i, radius: r, m }, off: Math.abs(Math.hypot(du, dv) - rim) * scale });
	}
	return out;
}

/** an angle within an arc's, either way round */
function isOnArc(degrees: number, { start, end }: ArcSpan) {
	const [lo, hi] = [Math.min(start, end), Math.max(start, end)];
	return lo + ((((degrees - lo) % 360) + 360) % 360) <= hi;
}

function nearArc(at: Point, i: number, arcs: ArcSpan[], m: SourceTransform) {
	const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
	const [u, v] = sourcePoint(...at, m);
	return arcs.flatMap((arc) => {
		const [du, dv] = [u - arc.center.x, v - arc.center.y];
		if (!isOnArc((Math.atan2(dv, du) * 180) / Math.PI, arc)) return [];
		const target: DimensionTarget = { kind: 'radius', i, radius: arc, m, angle: (arc.start + arc.end) / 2 };
		return [{ target, off: Math.abs(Math.hypot(du, dv) - arc.value) * scale }];
	});
}

/**
 * What a click with the Dimension tool would measure: a point within `pointReach` starts a distance, else the nearest
 * segment, rectangle side or rim within `reach`; all in bp. Later statements are drawn over earlier ones and win ties
 */
export function dimensionAt(scene: DimensionScene, at: Point, reach: number, pointReach: number): DimensionHit | null {
	let best: { hit: DimensionHit; off: number } | null = null;
	let bestPoint: { hit: DimensionHit; off: number } | null = null;
	for (const st of scene.statements) {
		const outline = st.kind === 'node' || st.kind === 'axis' ? scene.outlines.find((b) => b.stmt === st.i) : undefined;
		const shape = st.kind === 'node' ? (scene.language.readNodeBox(scene.source, st)?.shape ?? null) : null;
		const e = outline && nodeOutlineHit(st, outline, shape, at);
		if (e && e.off < reach && (!best || e.off <= best.off)) best = { hit: { target: e.target }, off: e.off };
		// a node's point is its center, which a distance may run from or to
		if (st.kind !== 'path' && st.kind !== 'node') continue;
		const m = scene.transformOf(st.i);
		const points = scene.language.pathPoints(scene.source, st);
		for (const [k, q] of points.entries()) {
			const c = canvasPoint(q.x, q.y, m);
			const off = Math.hypot(c[0] - at[0], c[1] - at[1]);
			if (off < pointReach && (!bestPoint || off <= bestPoint.off)) bestPoint = { hit: { point: { i: st.i, points, k, m }, at: c }, off };
		}
		if (st.kind !== 'path') continue;
		for (const e of edgesOf(st.i, points, m)) {
			const off = distanceToSegment(at, ...e.ends);
			if (off < reach && (!best || off <= best.off)) best = { hit: { target: e.target }, off };
		}
		const rims = [
			...nearRim(at, st.i, scene.language.radii(scene.source, st), m),
			...nearArc(at, st.i, scene.language.arcs(scene.source, st), m)
		];
		for (const r of rims) if (r.off < reach && (!best || r.off <= best.off)) best = { hit: { target: r.target }, off: r.off };
	}
	return bestPoint?.hit ?? best?.hit ?? null;
}
