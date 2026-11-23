// the handlers faces put on their elements (FaceElement.on), then the views' stopEvent, before ProseMirror's own handling
import type { CanvasPointerEvent, FaceDrag, FaceEventType } from '../../contracts/faceTypes';
import type { CanvasHit } from '../../contracts/geometryTypes';
import type { VisualView } from '../../contracts/viewTypes';
import type { CanvasEvent } from '../../contracts/nodeViewTypes';
import { FaceElement } from '../../tree/faceElement';

/** the position before the node an element's face draws */
function facePos(view: VisualView, element: FaceElement): number {
	const at = view.posAtDOM(element, 0);
	const node = view.state.doc.nodeAt(at);
	// posAtDOM answers inside a node with content and before a leaf
	return node && node.isLeaf && !node.isText ? at : at - 1;
}

/** true when a handler took the event; a captured drag goes to `capture` */
export function runFaceHandlers(
	view: VisualView,
	type: FaceEventType,
	event: CanvasPointerEvent,
	hit: CanvasHit,
	capture: (owner: FaceElement, drag: FaceDrag) => void
): boolean {
	for (const element of hit.chain) {
		const handler = element.on[type];
		if (!handler) continue;
		const ctx = { view, hit, element, pos: () => facePos(view, element), capture: (drag: FaceDrag) => capture(element, drag) };
		if (handler(event, ctx)) return true;
	}
	return false;
}

/** eventBelongsToView: every view from the target out is asked, innermost first */
export function viewsStopEvent(event: CanvasEvent): boolean {
	for (let at: FaceElement | HTMLElement | null = event.target; at instanceof FaceElement; at = at.parentNode)
		if (at.viewDesc?.stopEvent(event)) return true;
	return false;
}
