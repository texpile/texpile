import { sourcePoint, type Point } from '../../../figure/geometry';
import { subtree } from '../../../objects/statementTree';
import type { FigureEditorState } from '../../editorState.svelte';
import { chosen, editEach } from '../../selection/selectionCommands';
import { unionBox } from '../../snapTargets';
import type { RotateDrag } from '../canvasGesture.types';

const HANDLE_GAP_PX = 22;
const STEP_DEGREES = 15;

/** what the selection turns about, the middle of all of it drawn, and where its handle sits above it; null when
 *  something in it does not turn or is locked */
export function rotationPivot(ed: FigureEditorState) {
	const turning = chosen(ed);
	if (!turning.length || turning.some((s) => ed.flags.lockedAll.has(s.i) || ed.language.readRotation(ed.source, s) === null)) return null;
	const inside = new Set(turning.flatMap((s) => subtree(ed.tree, s.i)));
	const box = unionBox(ed.snapBoxes.filter((b) => inside.has(b.stmt)));
	if (!box) return null;
	const center: Point = [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2];
	return { center, top: [center[0], box.y2] as Point, handle: [center[0], box.y2 + HANDLE_GAP_PX / ed.viewport.scale] as Point };
}

export function startRotate(ed: FigureEditorState, at: Point): RotateDrag | null {
	const pivot = rotationPivot(ed);
	if (!pivot) return null;
	const [cx, cy] = pivot.center;
	return {
		kind: 'rotate',
		base: ed.source,
		center: pivot.center,
		start: Math.atan2(at[1] - cy, at[0] - cx),
		ids: chosen(ed).map((s) => s.i)
	};
}

/** the selection turned as far round its middle as the pointer has gone; Shift keeps to 15 degree steps */
export function rotatedSource(ed: FigureEditorState, drag: RotateDrag, e: PointerEvent, at: Point) {
	const [cx, cy] = drag.center;
	const turned = ((Math.atan2(at[1] - cy, at[0] - cx) - drag.start) * 180) / Math.PI;
	const degrees = e.shiftKey ? Math.round(turned / STEP_DEGREES) * STEP_DEGREES : Math.round(turned);
	const turning = ed.picture?.statements.filter((s) => drag.ids.includes(s.i)) ?? [];
	if (!degrees || !turning.length) return drag.base;
	return editEach(drag.base, turning, (text, st) =>
		ed.language.rotateStatement(text, st, sourcePoint(...drag.center, ed.render.outerOf(st.i)), degrees)
	);
}
