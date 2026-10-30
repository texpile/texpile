// a drag shorter than this in source units is a click
export const MIN_SIZE = 0.05;
// a press moves less than this many pixels and is still a click; with Alt, which copies, Excalidraw's own distance
export const DRAG_THRESHOLD_PX = 3;
export const COPY_THRESHOLD_PX = 10;
// how near the pointer comes to a point to snap onto it
export const SNAP_REACH_PX = 8;
// how near a line drawn click by click, or a polygon, comes back to its first corner to close on it
export const CLOSE_REACH_PX = 12;
// how near a node the pointer comes for its sides to offer a connector
export const NODE_HOVER_REACH_PX = 14;

export function isPastDragThreshold([x, y]: readonly [number, number], [px, py]: readonly [number, number]) {
	return Math.hypot(px - x, py - y) >= DRAG_THRESHOLD_PX;
}
