import { curveControls, type Point } from '../figure/geometry';
import type { ShapePreview } from '../state/gesture/canvasGesture.types';
import { familyOf, type ShapeFamily } from '../state/drawModes/drawModes';
import { boxCorners, drawnGeometry } from '../state/drawModes/drawnGeometry';

/** a rectangle or an ellipse as its mode makes it from the points so far; a three-point one shows its first side */
function modeShapePath(p: ShapePreview, family: ShapeFamily, at: (u: number, v: number) => string) {
	const g = drawnGeometry(family, p.mode ?? 'corners', p.points, { square: p.circle });
	if (!g) return '';
	if (g.kind === 'side') return `M${at(...g.from)}L${at(...g.to)}`;
	if (g.kind === 'ellipse') {
		const [cu, cv] = g.center;
		const steps = Array.from({ length: 49 }, (_, k) => (k * Math.PI) / 24);
		return steps.map((t, k) => `${k ? 'L' : 'M'}${at(cu + g.rx * Math.cos(t), cv + g.ry * Math.sin(t))}`).join('') + 'Z';
	}
	const corners = boxCorners(g);
	// a diamond's corners are the middles of its box's sides
	const outline =
		p.tool === 'diamond'
			? corners.map((c, k): Point => [(c[0] + corners[(k + 1) % 4][0]) / 2, (c[1] + corners[(k + 1) % 4][1]) / 2])
			: corners;
	return outline.map(([u, v], k) => `${k ? 'L' : 'M'}${at(u, v)}`).join('') + 'Z';
}

/** the outline of a shape being drawn, as an SVG path; `toCanvas` takes its source points onto the canvas */
export function shapePreviewPath(p: ShapePreview, toCanvas: (u: number, v: number) => Point) {
	function at(u: number, v: number) {
		return toCanvas(u, v).join(' ');
	}
	const family = familyOf(p.tool);
	if (family) return modeShapePath(p, family, at);
	const [[u1, v1], [u2, v2]] = [p.points[0], p.points.at(-1)!];
	switch (p.tool) {
		case 'line':
		case 'arrow':
		case 'pen':
			return p.points.map(([u, v], k) => `${k ? 'L' : 'M'}${at(u, v)}`).join('');
		case 'component': {
			// a part's body in the middle of its wire, as most two-terminal parts are drawn
			const [du, dv] = [u2 - u1, v2 - v1];
			const length = Math.hypot(du, dv) || 1;
			const [tu, tv] = [du / length, dv / length];
			const half = Math.min(0.4, length / 4);
			const [mu, mv] = [(u1 + u2) / 2, (v1 + v2) / 2];
			const [nu, nv] = [-tv * 0.15, tu * 0.15];
			const [s, e] = [
				[mu - tu * half, mv - tv * half],
				[mu + tu * half, mv + tv * half]
			];
			return `M${at(u1, v1)}L${at(s[0], s[1])}M${at(e[0], e[1])}L${at(u2, v2)}M${at(s[0] + nu, s[1] + nv)}L${at(e[0] + nu, e[1] + nv)}L${at(e[0] - nu, e[1] - nv)}L${at(s[0] - nu, s[1] - nv)}Z`;
		}
		case 'curve': {
			const [c1, c2] = curveControls(p.points[0], p.points.at(-1)!);
			return `M${at(u1, v1)}C${at(...c1)} ${at(...c2)} ${at(u2, v2)}`;
		}
		case 'polygon':
			return p.points.map(([u, v], k) => `${k ? 'L' : 'M'}${at(u, v)}`).join('') + (p.points.length > 2 ? 'Z' : '');
		case 'axes':
			return `M${at(u1, v2)}L${at(u1, v1)}L${at(u2, v1)}`;
	}
}
