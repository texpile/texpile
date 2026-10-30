import type { Point } from '../../figure/geometry';
import type { Guide } from '../snapTargets.types';
import {
	crossCircles,
	crossSegmentEllipse,
	crossSegments,
	distanceToOutline,
	distanceToSegment,
	footOnLine,
	onSegment
} from './snapGeometry';
import type { Snap, SnapKind, SnapScene } from './snapScene.types';

// a snap counts as this much farther than it is, so where two are about as near the stronger one wins
const WEIGHT: Record<SnapKind, number> = {
	endpoint: 1,
	intersection: 1,
	center: 1,
	midpoint: 1.15,
	quadrant: 1.15,
	perpendicular: 1.3
};
// a circle's center is offered from anywhere on its outline, behind any snap near the pointer itself
const CENTER_FROM_OUTLINE = 0.95;

/** `from`: the point a line is drawn from, for the perpendicular onto what the pointer is over */
export type SnapQuery = { at: Point; reach: number; exclude: number[]; from?: Point | null };

/** the nearest snap within reach of the pointer: points that stand, then crossings and perpendiculars found near it */
export function findSnap(scene: SnapScene, { at, reach, exclude, from }: SnapQuery): Snap | null {
	let best: Snap | null = null;
	let bestScore = reach;
	function offer(p: Point, kind: SnapKind, score = Math.hypot(p[0] - at[0], p[1] - at[1]) * WEIGHT[kind]) {
		if (score < bestScore) [best, bestScore] = [{ at: p, kind }, score];
	}
	for (const s of scene.points) if (!exclude.includes(s.stmt)) offer(s.at, s.kind);
	const segments = scene.segments.filter((s) => !exclude.includes(s.stmt) && distanceToSegment(at, s) < reach);
	const circles = scene.circles.filter((c) => !exclude.includes(c.stmt) && distanceToOutline(at, c) < reach);
	for (const c of circles) offer(c.center, 'center', reach * CENTER_FROM_OUTLINE);
	for (const [k, s] of segments.entries()) {
		for (const t of segments.slice(k + 1)) {
			const p = t.stmt === s.stmt && (t.a === s.b || t.b === s.a) ? null : crossSegments(s, t);
			if (p) offer(p, 'intersection');
		}
		for (const c of circles) for (const p of crossSegmentEllipse(s, c)) offer(p, 'intersection');
		if (from) {
			const foot = footOnLine(from, s.a, s.b);
			if (onSegment(foot, s)) offer(foot, 'perpendicular');
		}
	}
	for (const [k, c] of circles.entries())
		for (const d of circles.slice(k + 1)) for (const p of crossCircles(c, d)) offer(p, 'intersection');
	return best;
}

/** the pointer lined up across or up with an end or a center, as CAD's tracking lines do, `placed` on an axis that
 *  lines up with none; a guide runs from each point lined up with to where the pointer goes */
export function trackSnap(scene: SnapScene, at: Point, placed: Point, reach: number, exclude: number[]) {
	let x: { v: number; from: Point } | null = null;
	let y: { v: number; from: Point } | null = null;
	for (const s of scene.points) {
		if (exclude.includes(s.stmt) || (s.kind !== 'endpoint' && s.kind !== 'center')) continue;
		const [dx, dy] = [Math.abs(s.at[0] - at[0]), Math.abs(s.at[1] - at[1])];
		if (dx < reach && (!x || dx < Math.abs(x.v - at[0]))) x = { v: s.at[0], from: s.at };
		if (dy < reach && (!y || dy < Math.abs(y.v - at[1]))) y = { v: s.at[1], from: s.at };
	}
	if (!x && !y) return null;
	const point: Point = [x?.v ?? placed[0], y?.v ?? placed[1]];
	const guides: Guide[] = [];
	if (x) guides.push({ axis: 'x', at: x.v, from: Math.min(x.from[1], point[1]), to: Math.max(x.from[1], point[1]), tracking: true });
	if (y) guides.push({ axis: 'y', at: y.v, from: Math.min(y.from[0], point[0]), to: Math.max(y.from[0], point[0]), tracking: true });
	return { point, guides };
}
