import type { FigureStatement } from '../../../figure/figureLanguage';
import { sourceDelta, type Point } from '../../../figure/geometry';
import { BP_PER_CM } from '../../../figure/lengthUnits';
import { formatNumber, snapTo } from '../../../figure/numbers';
import type { FigureEditorState } from '../../editorState.svelte';
import { fromCenter, startBoxStretch, stretchFactors } from '../../selection/stretch';
import type { NodeSizeDrag } from '../canvasGesture.types';
import type { GestureSnap } from '../gestureSnap.svelte';

function cmOf(bp: number) {
	return Number(formatNumber(Math.abs(bp) / BP_PER_CM));
}

/** one node with an outline drawn, which its box's handles size as Excalidraw's do */
export function isSizableNode(ed: FigureEditorState) {
	const st = ed.selectedStatement;
	if (st?.kind !== 'node' || ed.selection.length !== 1 || ed.picture?.layout || !ed.selectedInfo?.movable) return false;
	return !!ed.render.drawing?.parts.some((p) => p.stmt === st.i && p.kind === 'path');
}

export function startNodeSize(ed: FigureEditorState, st: FigureStatement, at: Point, axes: 'x' | 'y' | 'xy'): NodeSizeDrag | null {
	const box = ed.snapBoxes.find((b) => b.stmt === st.i);
	if (!box) return null;
	return { kind: 'nodeSize', base: ed.source, st, start: at, ...startBoxStretch([box.x1, box.x2, box.y1, box.y2], at, false), axes };
}

/** the node at its least size, the side or corner across from the one dragged staying where it is */
export function nodeSizeSource(ed: FigureEditorState, snap: GestureSnap, drag: NodeSizeDrag, e: PointerEvent, at: Point) {
	const from = e.altKey ? fromCenter(drag) : drag;
	const travel: Point = [at[0] - drag.start[0], at[1] - drag.start[1]];
	const step = snap.step(e);
	const [sx, sy] = stretchFactors(from, travel, step * BP_PER_CM, e.shiftKey);
	const [w, h] = [Math.abs(drag.grab[0] - drag.anchor[0]), Math.abs(drag.grab[1] - drag.anchor[1])];
	const middle = [(drag.grab[0] + drag.anchor[0]) / 2, (drag.grab[1] + drag.anchor[1]) / 2];
	const by: Point = [(from.anchor[0] - middle[0]) * (1 - sx), (from.anchor[1] - middle[1]) * (1 - sy)];
	// the size is on the step, so the middle moves by half steps; the outline's own width would put it off them
	const [du, dv] = sourceDelta(...by, ed.render.transformOf(drag.st.i)).map((d) => snapTo(d, step / 2));
	let text = drag.base;
	if (du || dv) text = ed.language.shiftStatement(text, drag.st, du, dv, [by[0] / BP_PER_CM, by[1] / BP_PER_CM]);
	const st = ed.language.readPicture(text, ed.shownIndex)?.statements.find((s) => s.i === drag.st.i);
	const change = { ...(drag.axes !== 'y' && { w: cmOf(w * sx) }), ...(drag.axes !== 'x' && { h: cmOf(h * sy) }) };
	return st ? ed.language.writeNodeBox(text, st, change) : null;
}
