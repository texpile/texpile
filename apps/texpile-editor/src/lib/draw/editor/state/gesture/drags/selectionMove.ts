import { canvasPoint, sourceDelta, sourcePoint, type Point } from '../../../figure/geometry';
import type { FigureEditorState } from '../../editorState.svelte';
import { duplicateSelection, moveSelection } from '../../selection/selectionCommands';
import type { GestureOffset, PressRelease, SelectionMoveDrag } from '../canvasGesture.types';
import type { GestureSnap } from '../gestureSnap.svelte';
import { COPY_THRESHOLD_PX, DRAG_THRESHOLD_PX } from '../gestureThresholds';
import { snapTo } from '../../../figure/numbers';

/** the press has travelled far enough to be a drag; with Alt, which copies, it takes further */
export function isPastMoveThreshold(drag: SelectionMoveDrag, px: Point) {
	const reach = drag.copy ? COPY_THRESHOLD_PX : DRAG_THRESHOLD_PX;
	return Math.hypot(px[0] - drag.startPx[0], px[1] - drag.startPx[1]) >= reach;
}

/** where a dragged selection is: `delta` in the lead statement's units, `by` on the canvas in bp. Shift keeps it on
 *  one axis and Ctrl lets it off the grid and the other shapes, as in Excalidraw */
export function draggedSelection(ed: FigureEditorState, snap: GestureSnap, drag: SelectionMoveDrag, e: PointerEvent, at: Point) {
	const raw: Point = [at[0] - drag.start[0], at[1] - drag.start[1]];
	const axis = e.shiftKey ? (Math.abs(raw[0]) >= Math.abs(raw[1]) ? 'x' : 'y') : null;
	const travel: Point = axis === 'x' ? [raw[0], 0] : axis === 'y' ? [0, raw[1]] : raw;
	const free = e.ctrlKey || e.metaKey;
	const [du, dv] = sourceDelta(...travel, drag.m);
	// a node placed beside another, or a loop, has no point of its own: it moves by whole steps
	const first = drag.points[0] ?? { x: 0, y: 0 };
	const step = snap.step(e);
	// the first point lands on another statement's point or the grid, and the rest keep their places relative to it
	const onPoint = drag.points.length && !free && !axis ? snap.toPoint(canvasPoint(first.x + du, first.y + dv, drag.m), drag.ids) : null;
	if (!onPoint) snap.clearMark();
	const to = onPoint ? sourcePoint(...onPoint, drag.m) : [snapTo(first.x + du, step), snapTo(first.y + dv, step)];
	let delta: Point = [to[0] - first.x, to[1] - first.y];
	const [ox, oy] = canvasPoint(0, 0, drag.m);
	const [x, y] = canvasPoint(...delta, drag.m);
	const aligned = snap.alignBox(drag.box && !onPoint && !free ? drag.box : null, travel, [x - ox, y - oy], drag.ids);
	const by: Point = axis === 'x' ? [aligned[0], 0] : axis === 'y' ? [0, aligned[1]] : aligned;
	if (by[0] !== x - ox || by[1] !== y - oy) delta = sourceDelta(...by, drag.m);
	return { delta, by };
}

/** a press let go without a drag: the selection it settles on */
function releaseSelection(ed: FigureEditorState, release: PressRelease) {
	if (release.kind === 'only') ed.select(release.i);
	else if (release.kind === 'clear') ed.select(0);
	else if (release.kind === 'remove' && ed.selection.includes(release.i)) ed.toggleSelected(release.i);
}

/** the selection moved, or copied, where it was let go; the offset the canvas keeps showing until TeX draws it there */
export function releaseSelectionMove(ed: FigureEditorState, drag: SelectionMoveDrag, offset: GestureOffset | null): GestureOffset | null {
	const moved = !!(drag.delta[0] || drag.delta[1]);
	if (!drag.moving) {
		releaseSelection(ed, drag.release);
		return offset;
	}
	if (drag.copy) {
		if (offset && moved) duplicateSelection(ed, offset.by);
		return null;
	}
	if (!moved || !offset) return null;
	moveSelection(ed, offset.by);
	return { ...offset, until: ed.render.requested };
}
