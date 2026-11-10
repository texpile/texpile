import type { Endpoint } from '../../../figure/figureLanguage';
import { sourcePoint, type Point } from '../../../figure/geometry';
import { formatNumber, snapTo } from '../../../figure/numbers';
import type { FigureEditorState } from '../../editorState.svelte';
import { stretchStatements } from '../../selection/selectionCommands';
import { fromCenter, stretchFactors } from '../../selection/stretch';
import { frameResized } from '../../sheetFrame';
import type { EditDrag, EndDrag, EndAttachment, EndAttachmentLookup, GestureDrag, RadiusDrag } from '../canvasGesture.types';
import type { GestureSnap } from '../gestureSnap.svelte';
import { bendSource } from './bendDrag';
import { nodeSizeSource } from './nodeSizeDrag';
import { draggedPointSource } from './pointDrag';
import { rotatedSource } from './rotateDrag';

const EDIT_DRAG_KINDS = new Set<GestureDrag['kind']>([
	'point',
	'radius',
	'end',
	'frame',
	'stretch',
	'stretchGroup',
	'nodeSize',
	'bend',
	'rotate'
]);

export function isEditDrag(drag: GestureDrag | null): drag is EditDrag {
	return !!drag && EDIT_DRAG_KINDS.has(drag.kind);
}

function draggedRadiusSource(drag: RadiusDrag, at: Point, step: number) {
	const [u, v] = sourcePoint(...at, drag.m);
	const { center, axis } = drag.radius;
	const reach = axis === 'r' ? Math.hypot(u - center.x, v - center.y) : Math.abs(axis === 'x' ? u - center.x : v - center.y);
	const value = Math.max(step, snapTo(reach, step));
	return drag.base.slice(0, drag.radius.from) + formatNumber(value) + drag.base.slice(drag.radius.to);
}

export function endBindsToNodes(ed: FigureEditorState, i: number, e: MouseEvent) {
	const st = ed.tree.byId.get(i);
	return !!st && !!ed.language.readStyle(ed.source, st)?.arrows && !e.ctrlKey && !e.metaKey;
}

function draggedEndSource(
	ed: FigureEditorState,
	snap: GestureSnap,
	drag: EndDrag,
	e: PointerEvent,
	at: Point,
	target: EndAttachment | null
) {
	let to: Endpoint;
	if (target) to = { ref: target.ref, at: target.at, anchor: target.anchor };
	else {
		const onPoint = snap.toPoint(at, [drag.i]);
		const step = snap.step(e);
		const [u, v] = sourcePoint(...(onPoint ?? at), drag.m);
		to = onPoint ? [u, v] : [snapTo(u, step), snapTo(v, step)];
	}
	return ed.language.attachEnd(drag.base, ed.shownIndex, drag.i, drag.k, to);
}

/** the drag's result is written once, as the pointer comes up */
export function releaseEditDrag(ed: FigureEditorState, drag: EditDrag) {
	const done = ed.preview;
	// eslint-disable-next-line no-param-reassign -- the drag is over
	ed.preview = null;
	if (drag.kind === 'end' && drag.placed !== undefined) {
		if (drag.placed) ed.applyPlaced(drag.placed, false);
	} else if (done !== null && done !== ed.source) ed.applyEdit(done);
}

export function placedArrowEnd(ed: FigureEditorState, drag: EndDrag, target: EndAttachment | null) {
	return target && ed.language.pointArrow(drag.base, ed.shownIndex, drag.i, drag.k, target.ref);
}

export function editDragSource(
	ed: FigureEditorState,
	snap: GestureSnap,
	drag: EditDrag,
	e: PointerEvent,
	at: Point,
	attachAt: EndAttachmentLookup
): string | null {
	if (drag.kind === 'point') return draggedPointSource(ed, snap, drag, e, at);
	if (drag.kind === 'radius') return draggedRadiusSource(drag, at, snap.step(e));
	if (drag.kind === 'nodeSize') return nodeSizeSource(ed, snap, drag, e, at);
	if (drag.kind === 'bend') return bendSource(ed, drag, at);
	if (drag.kind === 'rotate') return rotatedSource(ed, drag, e, at);
	if (drag.kind === 'end') return draggedEndSource(ed, snap, drag, e, at, attachAt(at, [drag.i]));
	if (drag.kind === 'frame')
		return ed.picture
			? ed.language.writeFrame(drag.base, ed.picture, frameResized(drag.frame, drag.axes, sourcePoint(...at, drag.m), snap.step(e)))
			: null;
	const [u, v] = sourcePoint(...at, drag.m);
	const from = e.altKey ? fromCenter(drag) : drag;
	const [sx, sy] = stretchFactors(from, [u - drag.start[0], v - drag.start[1]], snap.step(e), e.shiftKey);
	if (drag.kind === 'stretch') return ed.language.stretchStatement(drag.base, drag.st, from.anchor, sx, sy);
	return stretchStatements(ed, drag.base, drag.group, from.anchor, drag.m, sx, sy);
}
