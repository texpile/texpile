export const MIN_SIZE = 0.05;
// a press moves less than this many pixels and is still a click; with Alt, which copies, Excalidraw's own distance
export const DRAG_THRESHOLD_PX = 3;
export const COPY_THRESHOLD_PX = 10;
export const SNAP_REACH_PX = 8;
export const CLOSE_REACH_PX = 12;
export const NODE_HOVER_REACH_PX = 14;

export function isPastDragThreshold([x, y]: readonly [number, number], [px, py]: readonly [number, number]) {
	return Math.hypot(px - x, py - y) >= DRAG_THRESHOLD_PX;
}
