import type { Point } from '../../figure/geometry';
import type { PointSpan, RadiusSpan } from '../../figure/figureLanguage';
import { snapTo } from '../../figure/numbers';

export type StretchDrag = { grab: Point; anchor: Point; uniform: boolean; axes: 'x' | 'y' | 'xy' };

export function startStretch(points: PointSpan[], rims: RadiusSpan[], [u, v]: Point): StretchDrag {
	const us = points.map((p) => p.x);
	const vs = points.map((p) => p.y);
	for (const r of rims) {
		if (r.axis !== 'y') us.push(r.center.x - r.value, r.center.x + r.value);
		if (r.axis !== 'x') vs.push(r.center.y - r.value, r.center.y + r.value);
	}
	const box: [number, number, number, number] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
	return startBoxStretch(
		box,
		[u, v],
		rims.some((r) => r.axis === 'r')
	);
}

export function startBoxStretch([u1, u2, v1, v2]: [number, number, number, number], [u, v]: Point, uniform: boolean): StretchDrag {
	const right = Math.abs(u - u2) < Math.abs(u - u1);
	const top = Math.abs(v - v2) < Math.abs(v - v1);
	return { grab: [right ? u2 : u1, top ? v2 : v1], anchor: [right ? u1 : u2, top ? v1 : v2], uniform, axes: 'xy' };
}

function axisFactor(grab: number, anchor: number, travel: number, step: number) {
	const extent = grab - anchor;
	if (Math.abs(extent) < 1e-9) return null;
	const next = snapTo(extent + travel, step);
	return (next || Math.sign(extent) * step) / extent;
}

export function fromCenter(drag: StretchDrag): StretchDrag {
	return { ...drag, anchor: [(drag.grab[0] + drag.anchor[0]) / 2, (drag.grab[1] + drag.anchor[1]) / 2] };
}

export function stretchFactors(drag: StretchDrag, travel: Point, step: number, keepShape: boolean): Point {
	const sx = drag.axes === 'y' ? null : axisFactor(drag.grab[0], drag.anchor[0], travel[0], step);
	const sy = drag.axes === 'x' ? null : axisFactor(drag.grab[1], drag.anchor[1], travel[1], step);
	if (!drag.uniform && !keepShape) return [sx ?? 1, sy ?? 1];
	const s = sx === null ? Math.abs(sy ?? 1) : sy === null ? Math.abs(sx) : Math.max(Math.abs(sx), Math.abs(sy));
	return [s, s];
}
