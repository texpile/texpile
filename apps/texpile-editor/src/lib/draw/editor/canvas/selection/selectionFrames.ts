import { subtree } from '../../objects/statementTree';
import type { FigureEditorState } from '../../state/editorState.svelte';
import type { CanvasGesture } from '../../state/gesture/canvasGesture.svelte';
import { boundsOf } from '../drawing/partBounds';

type FrameRect = { x: number; y: number; w: number; h: number };
export type StatementFrame = FrameRect & { i: number };

/** a statement's drawn box, a scope's around what is in it, padded by `px` and carried along by a drag */
export function statementFrame(ed: FigureEditorState, gesture: CanvasGesture, i: number, px: number): StatementFrame | null {
	const inside = new Set(subtree(ed.tree, i));
	const parts = ed.render.drawing?.parts.filter((p) => inside.has(p.stmt) && !p.apart && !ed.flags.hiddenAll.has(p.stmt));
	const b = parts?.length ? boundsOf(parts, (f) => ed.render.fonts.get(f)?.size ?? 10, ed.render.drawing?.clips) : null;
	if (!b) return null;
	const [ox, oy] = gesture.offsetOf(parts![0].stmt) ?? [0, 0];
	const pad = px / ed.viewport.scale;
	return { i, x: b.x1 - pad + ox, y: b.y1 - pad + oy, w: b.x2 - b.x1 + 2 * pad, h: b.y2 - b.y1 + 2 * pad };
}

/** the box around all of the frames, `pad` further out */
export function groupFrame(frames: FrameRect[], pad: number): FrameRect {
	const x = Math.min(...frames.map((f) => f.x)) - pad;
	const y = Math.min(...frames.map((f) => f.y)) - pad;
	const w = Math.max(...frames.map((f) => f.x + f.w)) + pad - x;
	const h = Math.max(...frames.map((f) => f.y + f.h)) + pad - y;
	return { x, y, w, h };
}

/** the corner handles that stretch a box, keyed `g` for a group's and `s` for one shape's */
export function cornerHandles({ x, y, w, h }: FrameRect, key: 'g' | 's' | 'n') {
	return [
		{ key: `${key}0`, at: [x, y], cursor: 'nesw' },
		{ key: `${key}1`, at: [x + w, y], cursor: 'nwse' },
		{ key: `${key}2`, at: [x + w, y + h], cursor: 'nesw' },
		{ key: `${key}3`, at: [x, y + h], cursor: 'nwse' }
	];
}

/** the strips along a box's sides that stretch it along one axis, `reach` either side of each */
export function sideHandles(b: FrameRect, key: 'g' | 's' | 'n', reach: number) {
	return [
		{ key: `${key}x`, x: b.x - reach, y: b.y, w: 2 * reach, h: b.h, cursor: 'ew' },
		{ key: `${key}x`, x: b.x + b.w - reach, y: b.y, w: 2 * reach, h: b.h, cursor: 'ew' },
		{ key: `${key}y`, x: b.x, y: b.y - reach, w: b.w, h: 2 * reach, cursor: 'ns' },
		{ key: `${key}y`, x: b.x, y: b.y + b.h - reach, w: b.w, h: 2 * reach, cursor: 'ns' }
	];
}
