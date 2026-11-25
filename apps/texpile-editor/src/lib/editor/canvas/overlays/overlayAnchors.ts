// what overlays stand on (12.1): a node, a range or a face part, followed through every edit, or the caret
import type { AnchorKey, OverlayAnchor, OverlayAnchors } from '../contracts/overlayTypes';
import type { DocRect } from '../contracts/layoutTypes';
import type { VisualView } from '../contracts/viewTypes';
import { rectUnion } from '../geometry/rangeRects';
import { TrackedPositions, type TrackedRange } from './trackedPositions';
import { virtualAnchor } from './virtualAnchor';

let nextAnchor = 0;

/** the pane's client box: what a writer sees of the document */
/* eslint-disable canvas/no-dom-measurement -- the pane's own box, not the document's */
function paneBox(scroller: HTMLElement): { left: number; top: number; right: number; bottom: number } {
	const doc = scroller.ownerDocument;
	if (scroller === doc.scrollingElement || scroller === doc.documentElement)
		return { left: 0, top: 0, right: scroller.clientWidth, bottom: scroller.clientHeight };
	const box = scroller.getBoundingClientRect();
	return { left: box.left, top: box.top, right: box.left + scroller.clientWidth, bottom: box.top + scroller.clientHeight };
}
/* eslint-enable canvas/no-dom-measurement */

function anchorOf(
	view: VisualView,
	tracked: TrackedPositions,
	range: TrackedRange | null,
	read: (range: TrackedRange | null) => DocRect | null
): OverlayAnchor {
	const key: AnchorKey = { id: ++nextAnchor };
	const stops = new Set<() => void>();
	function docRect(): DocRect | null {
		return range?.dead ? null : read(range);
	}
	function clientRect(): DOMRect | null {
		const rect = docRect();
		return rect ? view.canvas.clientRect(rect) : null;
	}
	const anchor: OverlayAnchor = {
		key,
		docRect,
		clientRect,
		visible() {
			const rect = clientRect();
			if (!rect) return false;
			const pane = paneBox(view.canvas.scroller);
			return rect.bottom > pane.top && rect.top < pane.bottom && rect.right > pane.left && rect.left < pane.right;
		},
		virtual: () => virtualAnchor(anchor, view.dom),
		onChange(listener) {
			const stop = view.canvas.onLayout(listener);
			stops.add(stop);
			return () => {
				stops.delete(stop);
				stop();
			};
		},
		dispose() {
			if (range) tracked.forget(range);
			for (const stop of stops) stop();
			stops.clear();
		}
	};
	return anchor;
}

export function createOverlayAnchors(view: VisualView, tracked: TrackedPositions): OverlayAnchors {
	const { geometry } = view.canvas;
	function nodeRange(pos: number): TrackedRange {
		return tracked.track(pos, pos + (view.state.doc.nodeAt(pos)?.nodeSize ?? 0));
	}
	return {
		caret: () => anchorOf(view, tracked, null, () => view.canvas.nested()?.caretRect() ?? geometry.caretRect(view.canvas.head())),
		node: (pos) => anchorOf(view, tracked, nodeRange(pos), (at) => geometry.nodeRect(at!.from)?.rect ?? null),
		range: (from, to) => anchorOf(view, tracked, tracked.track(from, to), (at) => rectUnion(geometry.rangeRects(at!.from, at!.to, 'text'))),
		part: (pos, part) => anchorOf(view, tracked, nodeRange(pos), (at) => geometry.partRect(at!.from, part))
	};
}
