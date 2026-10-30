import type { Box, Point } from '../../../figure/geometry';
import { ancestry } from '../../../objects/statementTree';
import type { FigureEditorState } from '../../editorState.svelte';
import type { MarqueeDrag } from '../canvasGesture.types';
import { DRAG_THRESHOLD_PX } from '../gestureThresholds';

/** a few pixels of travel is still a click, which leaves the selection as the press made it */
export function isMarqueeStarted(drag: MarqueeDrag, px: Point) {
	return Math.hypot(px[0] - drag.startPx[0], px[1] - drag.startPx[1]) >= DRAG_THRESHOLD_PX;
}

export function marqueeBox(drag: MarqueeDrag, at: Point): Box {
	const [x1, x2] = [Math.min(drag.start[0], at[0]), Math.max(drag.start[0], at[0])];
	const [y1, y2] = [Math.min(drag.start[1], at[1]), Math.max(drag.start[1], at[1])];
	return { x1, y1, x2, y2 };
}

/** what a marquee takes: whole shapes inside it, and a scope only when all it holds is, its locked shapes aside */
export function enclosedStatements(ed: FigureEditorState, box: Box) {
	const locked = ed.flags.lockedAll;
	const whole = new Map<number, boolean>();
	for (const b of ed.snapBoxes) {
		if (b.stmt <= 0 || locked.has(b.stmt) || !ed.tree.byId.get(b.stmt)) continue;
		const top = ancestry(ed.tree, b.stmt).at(-1) ?? b.stmt;
		const inside = b.x1 >= box.x1 && b.x2 <= box.x2 && b.y1 >= box.y1 && b.y2 <= box.y2;
		whole.set(top, (whole.get(top) ?? true) && inside);
	}
	return [...whole].filter(([, inside]) => inside).map(([top]) => top);
}
