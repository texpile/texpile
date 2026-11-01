import type { PointSpan } from '../../../figure/figureLanguage';
import { canvasPoint, sourceDelta, sourcePoint, type Point } from '../../../figure/geometry';
import type { FigureEditorState } from '../../editorState.svelte';
import type { PointDrag } from '../canvasGesture.types';
import type { GestureSnap } from '../gestureSnap.svelte';
import { snapTo } from '../../../figure/numbers';
import { withPointsMoved } from '../../selection/joinedEnds';

export function onAngleStep([bu, bv]: Point, [u, v]: Point, step: number): Point {
	const turn = Math.PI / 12;
	const angle = Math.round(Math.atan2(v - bv, u - bu) / turn) * turn;
	const r = Math.max(step, snapTo(Math.hypot(u - bu, v - bv), step));
	return [bu + r * Math.cos(angle), bv + r * Math.sin(angle)];
}

function snapToStep(p: PointSpan, [u, v]: Point, step: number): Point {
	return p.polar ? onAngleStep(p.base ?? [0, 0], [u, v], step) : [snapTo(u, step), snapTo(v, step)];
}

function neighbourOf(points: PointSpan[], k: number): Point | null {
	const n = points[k - 1] ?? points[k + 1];
	return n ? [n.x, n.y] : null;
}

function acrossRectangle(points: PointSpan[], k: number): Point | null {
	const n = points[k].joined === 'rectangle' ? points[k - 1] : points[k + 1]?.joined === 'rectangle' ? points[k + 1] : null;
	return n ? [n.x, n.y] : null;
}

function onDiagonal(across: Point, p: Point, to: Point, step: number): Point {
	const d = [p[0] - across[0], p[1] - across[1]];
	let t = ((to[0] - across[0]) * d[0] + (to[1] - across[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2 || 1);
	if (d[0]) t = (Math.sign(t || 1) * Math.max(step, snapTo(Math.abs(t * d[0]), step))) / Math.abs(d[0]);
	return [across[0] + t * d[0], across[1] + t * d[1]];
}

export function draggedPointSource(ed: FigureEditorState, snap: GestureSnap, drag: PointDrag, e: PointerEvent, at: Point) {
	const [du, dv] = sourceDelta(at[0] - drag.start[0], at[1] - drag.start[1], drag.m);
	const step = snap.step(e);
	const p = drag.points[drag.k];
	const across = e.shiftKey ? acrossRectangle(drag.points, drag.k) : null;
	const lockedTo = e.shiftKey && !across ? neighbourOf(drag.points, drag.k) : null;
	let to = across
		? onDiagonal(across, [p.x, p.y], [p.x + du, p.y + dv], step)
		: lockedTo
			? onAngleStep(lockedTo, [p.x + du, p.y + dv], step)
			: snapToStep(p, [p.x + du, p.y + dv], step);
	snap.clearGuides();
	const own = [ed.selected, ...drag.joined.map((j) => j.i)];
	if (!p.polar && !lockedTo && !across) {
		const raw = canvasPoint(p.x + du, p.y + dv, drag.m);
		const before = neighbourOf(drag.points, drag.k);
		const onPoint = snap.toPoint(raw, own, before && canvasPoint(...before, drag.m));
		const aligned = onPoint ?? snap.trackPoint(raw, canvasPoint(...to, drag.m), own);
		if (aligned) to = sourcePoint(...aligned, drag.m);
	}
	if (!drag.joined.length) return ed.language.movePoint(drag.base, drag.points, drag.k, to);
	const junction = canvasPoint(...to, drag.m);
	const ends = [{ points: drag.points, k: drag.k, m: drag.m, to: junction }, ...drag.joined.map((j) => ({ ...j, to: junction }))];
	return withPointsMoved(ed, drag.base, ends);
}
