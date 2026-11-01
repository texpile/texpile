import type { ArcSpans, TrimmableShape, TrimmedShape, TrimRun } from '../../figure/figureLanguage';
import type { Point } from '../../figure/geometry';
import { footOnLine } from '../snap/snapGeometry';

export type TrimCut = { removed: Point[]; left: TrimmedShape | null };
type Segment = [Point, Point];
type Outline = Exclude<TrimmableShape, { kind: 'node' }>;
type Ellipse = { center: Point; rx: number; ry: number; spans?: ArcSpans };

const SAME = 1e-6;
const ONE = 1e-4;
const ARC_STEPS = 48;
const CURVE_STEPS = 12;

export function flattenPath(d: string): Segment[] {
	const out: Segment[] = [];
	let start: Point | null = null;
	let at: Point | null = null;
	for (const [, op, args] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
		const n = args.match(/-?\d*\.?\d+(?:e-?\d+)?/g)?.map(Number) ?? [];
		if (op === 'M') at = start = [n[0], n[1]];
		else if (op === 'L' && at) out.push([at, (at = [n[0], n[1]])]);
		else if (op === 'Z' && at && start) out.push([at, (at = start)]);
		else if (op === 'C' && at) {
			const p0 = at;
			for (let k = 1; k <= CURVE_STEPS; k++) {
				const t = k / CURVE_STEPS;
				const [a, b, c, e] = [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
				const p: Point = [a * p0[0] + b * n[0] + c * n[2] + e * n[4], a * p0[1] + b * n[1] + c * n[3] + e * n[5]];
				out.push([at, (at = p)]);
			}
		}
	}
	return out;
}

export function outlineBox(d: string) {
	const points = flattenPath(d).flat();
	const xs = points.map((p) => p[0]);
	const ys = points.map((p) => p[1]);
	return points.length ? { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) } : null;
}

function segmentsOf(points: Point[], closed: boolean): Segment[] {
	const n = closed ? points.length : points.length - 1;
	return Array.from({ length: n }, (_, i): Segment => [points[i], points[(i + 1) % points.length]]);
}

function along([a, b]: Segment, p: Point) {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	return ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
}

function pointAt(segments: Segment[], s: number): Point {
	const n = segments.length;
	let w = s - n * Math.floor(s / n);
	if (w < SAME && s > SAME) w = n;
	const i = Math.min(Math.floor(w), n - 1);
	const [a, b] = segments[i];
	const t = w - i;
	return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

function stretch(segments: Segment[], s0: number, s1: number): Point[] {
	const corners: Point[] = [];
	for (let k = Math.floor(s0 + SAME) + 1; k < s1 - SAME; k++)
		corners.push(segments[((k % segments.length) + segments.length) % segments.length][0]);
	return [pointAt(segments, s0), ...corners, pointAt(segments, s1)];
}

function distinct(values: number[]) {
	return [...values].sort((a, b) => a - b).filter((v, k, all) => k === 0 || v - all[k - 1] > ONE);
}

function meeting([a, b]: Segment, [c, d]: Segment, touch: number) {
	const [rx, ry, qx, qy] = [b[0] - a[0], b[1] - a[1], d[0] - c[0], d[1] - c[1]];
	const denom = rx * qy - ry * qx;
	if (Math.abs(denom) < 1e-12) return null;
	const [wx, wy] = [c[0] - a[0], c[1] - a[1]];
	const u = (wx * qy - wy * qx) / denom;
	const v = (wx * ry - wy * rx) / denom;
	const [du, dv] = [touch / (Math.hypot(rx, ry) || 1), touch / (Math.hypot(qx, qy) || 1)];
	return u >= -du && u <= 1 + du && v >= -dv && v <= 1 + dv ? Math.min(1, Math.max(0, u)) : null;
}

function crossingsOf(segments: Segment[], cutters: Segment[], at: Point, touch: number) {
	const crossings: number[] = [];
	let nearest = { s: 0, d: Infinity };
	segments.forEach((seg, i) => {
		for (const cutter of cutters) {
			const u = meeting(seg, cutter, touch);
			if (u !== null) crossings.push(i + u);
		}
		const foot = footOnLine(at, seg[0], seg[1], true);
		const d = Math.hypot(at[0] - foot[0], at[1] - foot[1]);
		if (d < nearest.d) nearest = { s: i + along(seg, foot), d };
	});
	return { crossings: distinct(crossings), at: nearest.s };
}

function lengthOf(points: Point[]) {
	return points.slice(1).reduce((sum, p, k) => sum + Math.hypot(p[0] - points[k][0], p[1] - points[k][1]), 0);
}

function runCut({ points, closed }: TrimRun, cutters: Segment[], at: Point, touch: number) {
	const segments = segmentsOf(points, closed);
	const n = segments.length;
	if (!n) return null;
	const found = crossingsOf(segments, cutters, at, touch);
	const bounds = distinct([...found.crossings, ...Array.from({ length: n + 1 }, (_, k) => k)]);
	const a = Math.max(...bounds.filter((s) => s < found.at - SAME), 0);
	const b = Math.min(...bounds.filter((s) => s > found.at + SAME), n);
	const kept = closed ? [stretch(segments, b, a + n)] : [stretch(segments, 0, a), stretch(segments, b, n)];
	return { removed: stretch(segments, a, b), pieces: kept.filter((piece) => lengthOf(piece) > touch) };
}

function runDistance({ points, closed }: TrimRun, at: Point) {
	return Math.min(
		...segmentsOf(points, closed).map(([a, b]) => {
			const foot = footOnLine(at, a, b, true);
			return Math.hypot(at[0] - foot[0], at[1] - foot[1]);
		})
	);
}

function polylineCut(runs: TrimRun[], cutters: Segment[], at: Point, touch: number): TrimCut | null {
	const k = runs.reduce((best, run, i) => (runDistance(run, at) < runDistance(runs[best], at) ? i : best), 0);
	const cut = runCut(runs[k], cutters, at, touch);
	if (!cut) return null;
	const left = [...runs.slice(0, k), ...cut.pieces.map((points) => ({ points, closed: false })), ...runs.slice(k + 1)];
	return { removed: cut.removed, left: left.length ? { kind: 'polyline', runs: left } : null };
}

function meetingEllipse([a, b]: Segment, { center, rx, ry }: { center: Point; rx: number; ry: number }, touch: number): Point[] {
	const [ax, ay] = [(a[0] - center[0]) / rx, (a[1] - center[1]) / ry];
	const [dx, dy] = [(b[0] - a[0]) / rx, (b[1] - a[1]) / ry];
	const [qa, qb, qc] = [dx * dx + dy * dy, 2 * (ax * dx + ay * dy), ax * ax + ay * ay - 1];
	const disc = qb * qb - 4 * qa * qc;
	if (qa < 1e-12 || disc < 0) return [];
	const root = Math.sqrt(disc);
	const past = touch / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
	return [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]
		.filter((t) => t >= -past && t <= 1 + past)
		.map((t): Point => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
}

function angleOf({ center: [cx, cy], rx, ry }: { center: Point; rx: number; ry: number }, [x, y]: Point) {
	const deg = (Math.atan2((y - cy) / ry, (x - cx) / rx) * 180) / Math.PI;
	return (deg + 360) % 360;
}

function arcPoints({ center: [cx, cy], rx, ry }: { center: Point; rx: number; ry: number }, from: number, to: number): Point[] {
	return Array.from({ length: ARC_STEPS + 1 }, (_, k): Point => {
		const t = ((from + ((to - from) * k) / ARC_STEPS) * Math.PI) / 180;
		return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
	});
}

function inSpan(t: number, [s0, s1]: [number, number]) {
	const u = t + 360 * Math.ceil((s0 - t - SAME) / 360);
	return u <= s1 + SAME ? u : null;
}

function ellipseCut(e: Ellipse, cutters: Segment[], at: Point, touch: number): TrimCut | null {
	const crossings = distinct(cutters.flatMap((cutter) => meetingEllipse(cutter, e, touch)).map((p) => angleOf(e, p)));
	const c = angleOf(e, at);
	const { center, rx, ry } = e;
	if (!e.spans) {
		if (!crossings.length) return { removed: arcPoints(e, 0, 360), left: null };
		if (crossings.length < 2) return null;
		const a = Math.max(...crossings.filter((t) => t < c), Math.max(...crossings) - 360);
		const b = Math.min(...crossings.filter((t) => t > c), Math.min(...crossings) + 360);
		return { removed: arcPoints(e, a, b), left: { kind: 'arcs', center, rx, ry, spans: [[b, a + 360]] } };
	}
	const k = e.spans.findIndex((span) => inSpan(c, span) !== null);
	if (k < 0) return null;
	const span = e.spans[k];
	const cu = inSpan(c, span)!;
	const inside = crossings.map((t) => inSpan(t, span)).filter((u): u is number => u !== null && u > span[0] + SAME && u < span[1] - SAME);
	const a = Math.max(span[0], ...inside.filter((u) => u < cu));
	const b = Math.min(span[1], ...inside.filter((u) => u > cu));
	const least = (touch / Math.max(rx, ry)) * (180 / Math.PI);
	const pieces = (
		[
			[span[0], a],
			[b, span[1]]
		] as ArcSpans
	).filter(([x, y]) => y - x > least);
	const spans = [...e.spans.slice(0, k), ...pieces, ...e.spans.slice(k + 1)];
	return { removed: arcPoints(e, a, b), left: spans.length ? { kind: 'arcs', center, rx, ry, spans } : null };
}

export function trimCut(shape: Outline, cutters: Segment[], at: Point, touch: number): TrimCut | null {
	return shape.kind === 'polyline' ? polylineCut(shape.runs, cutters, at, touch) : ellipseCut(shape, cutters, at, touch);
}

export function distanceToShape(shape: Outline, at: Point) {
	if (shape.kind === 'polyline') return Math.min(...shape.runs.map((run) => runDistance(run, at)));
	const c = angleOf(shape, at);
	const ends = shape.spans && !shape.spans.some((span) => inSpan(c, span) !== null) ? shape.spans.flat() : [c];
	return Math.min(
		...ends.map((deg) => {
			const t = (deg * Math.PI) / 180;
			return Math.hypot(at[0] - shape.center[0] - shape.rx * Math.cos(t), at[1] - shape.center[1] - shape.ry * Math.sin(t));
		})
	);
}

export function outlineCorners(d: string): Point[] | null {
	if (/C/.test(d)) return null;
	const corners = [...d.matchAll(/[ML]\s*(-?\d*\.?\d+(?:e-?\d+)?)[\s,]+(-?\d*\.?\d+(?:e-?\d+)?)/g)].map((m): Point => [
		Number(m[1]),
		Number(m[2])
	]);
	const [first, last] = [corners[0], corners.at(-1)];
	if (first && last && corners.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < SAME) corners.pop();
	return corners.length >= 3 ? corners : null;
}
