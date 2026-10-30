import type { DrawnPart } from '../../drawing/drawing.types';
import type { FigureStatement } from '../../figure/figureLanguage';
import { canvasPoint, type Point, type SourceTransform } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';
import type { StatementBox } from '../snapTargets.types';
import { pathPieces } from './snapGeometry';
import type { FixedSnap, SnapCircle, SnapScene } from './snapScene.types';

const ROUND_NODES = new Set(['circle', 'ellipse']);

function distance(a: Point, b: Point) {
	return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** a statement's circles and ellipses, each by the point it is drawn around, and its arcs' centers, ends and middles */
function roundSnaps(ed: FigureEditorState, st: FigureStatement, m: SourceTransform, points: FixedSnap[], circles: SnapCircle[]) {
	const byCenter = new Map<string, { x: number; y: number; rx: number; ry: number }>();
	for (const r of ed.language.radii(ed.source, st)) {
		const key = `${r.center.x},${r.center.y}`;
		const c = byCenter.get(key) ?? { x: r.center.x, y: r.center.y, rx: r.value, ry: r.value };
		if (r.axis === 'x') c.rx = r.value;
		else if (r.axis === 'y') c.ry = r.value;
		byCenter.set(key, c);
	}
	for (const c of byCenter.values()) {
		const center = canvasPoint(c.x, c.y, m);
		const [rx, ry] = [distance(center, canvasPoint(c.x + c.rx, c.y, m)), distance(center, canvasPoint(c.x, c.y + c.ry, m))];
		circles.push({ stmt: st.i, center, rx, ry });
		points.push({ stmt: st.i, at: center, kind: 'center' });
		for (const [u, v] of [
			[c.rx, 0],
			[0, c.ry],
			[-c.rx, 0],
			[0, -c.ry]
		])
			points.push({ stmt: st.i, at: canvasPoint(c.x + u, c.y + v, m), kind: 'quadrant' });
	}
	for (const a of ed.language.arcs(ed.source, st)) {
		function along(deg: number) {
			const t = (deg * Math.PI) / 180;
			return canvasPoint(a.center.x + a.value * Math.cos(t), a.center.y + a.value * Math.sin(t), m);
		}
		points.push({ stmt: st.i, at: canvasPoint(a.center.x, a.center.y, m), kind: 'center' });
		points.push({ stmt: st.i, at: along(a.end), kind: 'endpoint' });
		points.push({ stmt: st.i, at: along((a.start + a.end) / 2), kind: 'midpoint' });
	}
	return byCenter.size > 0 || ed.language.arcs(ed.source, st).length > 0;
}

/** a node's drawn box: its corners, the middles of its sides (a round one's quadrants) and its center; the point it is
 *  written at is its center, where that is near the box's middle, since text draws its box a little off it */
function nodeSnaps(stmt: number, b: StatementBox, round: boolean, written: Point | null, points: FixedSnap[]) {
	const [cx, cy] = [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
	const near = written && Math.abs(written[0] - cx) < (b.x2 - b.x1) / 4 && Math.abs(written[1] - cy) < (b.y2 - b.y1) / 4;
	points.push({ stmt, at: near ? written : [cx, cy], kind: 'center' });
	for (const at of [
		[cx, b.y1],
		[cx, b.y2],
		[b.x1, cy],
		[b.x2, cy]
	] as Point[])
		points.push({ stmt, at, kind: round ? 'quadrant' : 'midpoint' });
	if (!round)
		for (const at of [
			[b.x1, b.y1],
			[b.x2, b.y1],
			[b.x1, b.y2],
			[b.x2, b.y2]
		] as Point[])
			points.push({ stmt, at, kind: 'endpoint' });
}

/**
 * What the canvas snaps to, as a CAD sketcher's object snaps: the points each path goes through, the middles of its
 * straight pieces, circles' centers and quadrants, arcs' ends and middles, nodes' corners, sides and centers; and the
 * lines and circles that intersections and perpendiculars are found on. The drawing's part is left out while it is
 * not a drawing of the text
 */
export function editorSnapScene(ed: FigureEditorState, shownParts: DrawnPart[]): SnapScene {
	const points: FixedSnap[] = [];
	const segments: SnapScene['segments'] = [];
	const circles: SnapCircle[] = [];
	const drawn = ed.drawingMatchesText;
	const round = new Set<number>();
	for (const st of ed.picture?.statements ?? []) {
		if (ed.flags.hiddenAll.has(st.i)) continue;
		const m = ed.render.transformOf(st.i);
		if (st.kind === 'node' && drawn) {
			const box = ed.snapBoxes.find((b) => b.stmt === st.i);
			const shape = ed.language.readNodeBox(ed.source, st)?.shape;
			const at = ed.language.pathPoints(ed.source, st)[0];
			const written = at ? canvasPoint(at.x, at.y, m) : null;
			if (box) nodeSnaps(st.i, box, !!shape && ROUND_NODES.has(shape), written, points);
			continue;
		}
		if (st.kind !== 'path' && st.kind !== 'plot') continue;
		const centers = new Set(ed.language.radii(ed.source, st).map((r) => r.centerPoint));
		const written = ed.language.pathPoints(ed.source, st);
		written.forEach((p, k) => {
			if (!p.aside && !centers.has(k)) points.push({ stmt: st.i, at: canvasPoint(p.x, p.y, m), kind: 'endpoint' });
			// a rectangle is one shape: its other corners and its center are its own too
			const q = written[k - 1];
			if (p.joined !== 'rectangle' || !q) return;
			for (const [u, v] of [
				[p.x, q.y],
				[q.x, p.y]
			])
				points.push({ stmt: st.i, at: canvasPoint(u, v, m), kind: 'endpoint' });
			points.push({ stmt: st.i, at: canvasPoint((p.x + q.x) / 2, (p.y + q.y) / 2, m), kind: 'center' });
		});
		if (roundSnaps(ed, st, m, points, circles)) round.add(st.i);
	}
	if (drawn)
		for (const p of shownParts) {
			if (p.kind !== 'path' || !p.stmt || ed.tree.byId.get(p.stmt)?.kind === 'node') continue;
			const { lines, curveMiddles } = pathPieces(p.d);
			for (const [a, b] of lines) {
				segments.push({ stmt: p.stmt, a, b });
				points.push({ stmt: p.stmt, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], kind: 'midpoint' });
			}
			// a circle is drawn as curves, whose middles are no points of it
			if (!round.has(p.stmt)) for (const at of curveMiddles) points.push({ stmt: p.stmt, at, kind: 'midpoint' });
		}
	return { points, segments, circles };
}
