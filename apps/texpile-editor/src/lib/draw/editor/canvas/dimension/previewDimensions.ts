import type { Point } from '../../figure/geometry';
import { BP_PER_CM } from '../../figure/lengthUnits';
import { formatNumber } from '../../figure/numbers';
import { familyOf } from '../../state/drawModes/drawModes';
import { boxCorners, drawnGeometry } from '../../state/drawModes/drawnGeometry';
import type { TypedField } from '../../state/typedDraw/typedDraw.svelte';
import type { ShapePreview } from '../../state/gesture/canvasGesture.types';
import { linearDrawing, type DimensionDrawing } from './dimensionDrawing';

const ANGLE_GAP_PX = 30;
const LINES = new Set<ShapePreview['tool']>(['line', 'arrow']);

/** one size a shape being drawn shows: its field, its value as shown, and where; a drawing for a length */
export type PreviewDimension = { field: TypedField; shown: string; label: Point; drawing: DimensionDrawing | null };

function cm(bp: number) {
	return `${formatNumber(bp / BP_PER_CM)} cm`;
}

/** a segment by its length and angle */
function segmentDimensions(a: Point, b: Point, scale: number): PreviewDimension[] {
	const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
	const length = linearDrawing(a, b, null, scale);
	const back = ANGLE_GAP_PX / scale / (Math.hypot(dx, dy) || 1);
	const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
	return [
		{ field: 'length', shown: cm(Math.hypot(dx, dy)), label: length.label, drawing: length },
		{ field: 'angle', shown: `${formatNumber(angle)}°`, label: [a[0] - dx * back, a[1] - dy * back], drawing: null }
	];
}

/**
 * The sizes of the shape being drawn, in canvas bp: a line's last segment by its length and angle; a box by its width
 * and height, a turned one by its height across its first side; a circle by its diameter, toward the pointer
 */
export function previewDimensions(p: ShapePreview, toCanvas: (u: number, v: number) => Point, scale: number): PreviewDimension[] {
	if (p.points.length < 2 || p.tool === 'pen') return [];
	const a = toCanvas(...p.points.at(-2)!);
	const b = toCanvas(...p.points.at(-1)!);
	if (Math.hypot(b[0] - a[0], b[1] - a[1]) * scale < 2) return [];
	// an end on a node is met at its border, so a length to its middle would be wrong, and its angle sits on its text
	if (LINES.has(p.tool)) return p.refs.some((r) => r !== null) ? [] : segmentDimensions(a, b, scale);
	const family = familyOf(p.tool);
	const g = family && drawnGeometry(family, p.mode ?? 'corners', p.points, { square: p.circle });
	if (!g) return [];
	if (g.kind === 'side') return segmentDimensions(toCanvas(...g.from), toCanvas(...g.to), scale);
	const center = toCanvas(...g.center);
	if (g.kind === 'ellipse' && g.circle) {
		const edge = toCanvas(g.center[0] + g.rx, g.center[1]);
		const r = Math.hypot(edge[0] - center[0], edge[1] - center[1]);
		const toward = Math.atan2(b[1] - center[1], b[0] - center[0]);
		const [ux, uy] = [r * Math.cos(toward), r * Math.sin(toward)];
		const across = linearDrawing([center[0] - ux, center[1] - uy], [center[0] + ux, center[1] + uy], null, scale);
		return [{ field: 'diameter', shown: `Ø ${cm(2 * r)}`, label: across.label, drawing: across }];
	}
	if (g.kind === 'box' && g.angle) {
		const [, c1, c2] = boxCorners(g).map((c) => toCanvas(...c));
		const height = linearDrawing(c1, c2, center, scale);
		return [{ field: 'height', shown: cm(Math.hypot(c2[0] - c1[0], c2[1] - c1[1])), label: height.label, drawing: height }];
	}
	// the corner across from the pointer, so the sizes sit on the box as it is drawn
	const far: Point = [2 * center[0] - b[0], 2 * center[1] - b[1]];
	const width = linearDrawing(far, [b[0], far[1]], center, scale);
	const height = linearDrawing([b[0], far[1]], b, center, scale);
	return [
		{ field: 'width', shown: cm(Math.abs(b[0] - far[0])), label: width.label, drawing: width },
		{ field: 'height', shown: cm(Math.abs(b[1] - far[1])), label: height.label, drawing: height }
	];
}
