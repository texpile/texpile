import type { FigureStatement, NodeShape } from '../../../figure/figureLanguage';
import { distanceToSegment, type Point } from '../../../figure/geometry';
import type { StatementBox } from '../../snapTargets.types';
import type { DimensionTarget } from '../dimensionTargets.types';

export type OutlineHit = { target: DimensionTarget; off: number };

/** how far a point is from a box's nearest side */
function boxOff({ x1, y1, x2, y2 }: StatementBox, at: Point) {
	const corners: Point[] = [
		[x1, y1],
		[x2, y1],
		[x2, y2],
		[x1, y2]
	];
	return Math.min(...corners.map((c, k) => distanceToSegment(at, c, corners[(k + 1) % 4])));
}

/** how far a point is from an ellipse's or a diamond's outline, as it fits its box, and the axis it is nearer */
function roundOff(shape: NodeShape, { x1, y1, x2, y2 }: StatementBox, [x, y]: Point) {
	const [cx, cy, a, b] = [(x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) / 2 || 1, (y2 - y1) / 2 || 1];
	const [ex, ey] = [(x - cx) / a, (y - cy) / b];
	if (shape === 'diamond') {
		const corners: Point[] = [
			[x2, cy],
			[cx, y2],
			[x1, cy],
			[cx, y1]
		];
		return Math.min(...corners.map((c, k) => distanceToSegment([x, y], c, corners[(k + 1) % 4])));
	}
	const t = Math.atan2(ey, ex);
	return Math.hypot(x - (cx + a * Math.cos(t)), y - (cy + b * Math.sin(t)));
}

/** how near the pointer is to a node's outline as drawn: a box's sides, an ellipse's, a circle's or a diamond's own */
export function nodeOutlineHit(st: FigureStatement, box: StatementBox, shape: NodeShape | null, at: Point): OutlineHit {
	const round = shape === 'ellipse' || shape === 'circle' || shape === 'diamond';
	const off = round ? roundOff(shape, box, at) : boxOff(box, at);
	return { target: { kind: 'node', i: st.i, st, box, round: shape === 'circle' }, off };
}
