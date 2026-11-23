// a sideways wheel or trackpad move (or Shift and the wheel) over a box that scrolls sideways (a wide table) scrolls the box;
// at its end, or anywhere else, the pane scrolls as the browser does
import type { CanvasGeometry, ScrollBoxAt } from '../../contracts/geometryTypes';
import type { DocPoint } from '../../contracts/layoutTypes';

/** the sideways distance a wheel event asks for: its own, or Shift turning the wheel sideways */
function sidewaysOf(event: WheelEvent): number {
	if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return event.deltaX;
	return event.shiftKey ? event.deltaY : 0;
}

/** scrolls a box by `dx` within what it can show; false when it is already at that end */
export function scrollBoxBy(box: ScrollBoxAt, dx: number): boolean {
	const { element } = box;
	const next = Math.min(box.max, Math.max(0, element.scrollLeft + dx));
	if (next === element.scrollLeft) return false;
	element.scrollLeft = next;
	element.noteMutation();
	return true;
}

/** true when the wheel scrolled a box */
export function sideScroll(event: WheelEvent, geometry: CanvasGeometry, at: DocPoint): boolean {
	const dx = sidewaysOf(event);
	if (!dx) return false;
	const box = geometry.scrollBoxAt(at);
	return !!box && scrollBoxBy(box, dx);
}
