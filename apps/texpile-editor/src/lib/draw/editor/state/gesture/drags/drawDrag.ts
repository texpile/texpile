import { sourcePoint, type Point } from '../../../figure/geometry';
import type { FigureEditorState } from '../../editorState.svelte';
import type { ToolId } from '../../editorState.types';
import type { DrawDrag, EndAttachmentLookup, ShapePreview } from '../canvasGesture.types';
import type { GestureSnap } from '../gestureSnap.svelte';
import { MIN_SIZE } from '../gestureThresholds';
import { onAngleStep } from './pointDrag';
import { pointsNeeded } from '../../drawModes/drawModes';

export const CONNECTING_TOOLS = new Set<ToolId>(['line', 'arrow', 'curve', 'component']);
// only an arrow connects to a node, as only Excalidraw's arrow binds; a line is geometry, and either becomes the other
// by its arrowheads
const BINDING_TOOLS = new Set<ToolId>(['arrow', 'component']);

/** whether an end meets the node under it; Ctrl lets go of it, as it lets go of Excalidraw's binding */
export function bindsToNodes(tool: ToolId, e: MouseEvent) {
	return BINDING_TOOLS.has(tool) && !e.ctrlKey && !e.metaKey;
}
/** another tool, or another way to draw this one, starts the shape being drawn over */
export function isStartedOver(ed: FigureEditorState, p: ShapePreview) {
	return p.tool !== ed.tool || (!!p.byClicks && p.mode !== ed.drawModeOf(ed.tool));
}

const BOX_TOOLS = new Set<ToolId>(['rect', 'box', 'diamond', 'oval', 'ellipse']);

function squared([u1, v1]: Point, [u2, v2]: Point): Point {
	const size = Math.max(Math.abs(u2 - u1), Math.abs(v2 - v1));
	return [u1 + Math.sign(u2 - u1 || 1) * size, v1 + Math.sign(v2 - v1 || 1) * size];
}

/** the shape being drawn, its far end where the pointer is; back onto the node it started from is a loop, and a line
 *  that never leaves that node is drawn inside it */
export function drawnPreview(
	ed: FigureEditorState,
	snap: GestureSnap,
	drag: DrawDrag,
	p: ShapePreview,
	e: PointerEvent,
	at: Point,
	attachAt: EndAttachmentLookup
): ShapePreview {
	const onOther = bindsToNodes(p.tool, e) ? attachAt(at) : null;
	// an end on a node goes where the node says, so nothing it snapped or lined up with before stays shown
	if (onOther) {
		snap.clearGuides();
		snap.clearMark();
	}
	const startNode = drag.from;
	if (startNode && drag.free && !p.leftStart && onOther?.ref === startNode.ref) {
		const inside = e.shiftKey ? onAngleStep(drag.free, sourcePoint(...at, ed.placement), snap.step(e)) : snap.placeNew(at, e);
		return { ...p, points: [drag.free, inside], circle: e.shiftKey, refs: [null, null], anchors: [null, null] };
	}
	const lineFrom = CONNECTING_TOOLS.has(p.tool) ? drag.start : null;
	let end = onOther?.at ?? (p.tool === 'pen' ? sourcePoint(...at, ed.placement) : snap.placeNew(at, e, lineFrom));
	// Shift: a line at a 15 degree step, a square; Alt: a box drawn out from its middle, as Excalidraw's
	if (e.shiftKey && !onOther && CONNECTING_TOOLS.has(p.tool)) {
		snap.clearGuides();
		snap.clearMark();
		end = onAngleStep(drag.start, sourcePoint(...at, ed.placement), snap.step(e));
	} else if (e.shiftKey && BOX_TOOLS.has(p.tool)) end = squared(drag.start, end);
	const fromCenter = e.altKey && BOX_TOOLS.has(p.tool) && (p.mode ?? 'corners') === 'corners';
	const from: Point = fromCenter ? [2 * drag.start[0] - end[0], 2 * drag.start[1] - end[1]] : drag.start;
	const points = p.tool === 'pen' ? [...p.points.slice(0, -1), end, end] : [from, end];
	const refs: ShapePreview['refs'] = [startNode?.ref ?? p.refs[0], onOther?.ref ?? null];
	const anchors: ShapePreview['anchors'] = [startNode ? startNode.anchor : p.anchors[0], onOther?.anchor ?? null];
	return { ...p, points, circle: e.shiftKey, refs, anchors, leftStart: !!startNode };
}

/** a click on a node's side, not a drag from it, which adds the step that follows it there */
export function isSideClick(drag: DrawDrag, p: ShapePreview) {
	const [a, b] = [p.points[0], p.points.at(-1)!];
	return !!drag.side && p.refs[0] !== null && p.refs[1] === null && Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_SIZE;
}

/** a box or an ellipse let go before it has the points its mode takes: a click starts one drawn click by click, as a
 *  CAD sketch's are, and a drag that drew a three-point shape's first side goes on to its third point */
export function goesOnByClicks(p: ShapePreview) {
	const [a, b] = [p.points[0], p.points.at(-1)!];
	if (!BOX_TOOLS.has(p.tool)) return null;
	if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_SIZE) return [a, a];
	return pointsNeeded(p.mode) > 2 ? [a, b, b] : null;
}

/** a click with a line or an arrow, which starts one drawn click by click */
export function isChainStart(p: ShapePreview) {
	const [a, b] = [p.points[0], p.points.at(-1)!];
	return (p.tool === 'line' || p.tool === 'arrow') && p.refs[1] === null && Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_SIZE;
}
