// an invisible element standing where a canvas block's panel opens: the popover's trigger and anchor, so its outside click,
// focus return and placement land there
import type { VisualView } from '$lib/editor/canvas';
import type { GearPlace } from './blockSettings';

export type PlacedHost = { host: HTMLElement; remove(): void };

export function placedHost(view: VisualView, place: GearPlace): PlacedHost {
	const doc = view.dom.ownerDocument;
	const host = doc.body.appendChild(doc.createElement('div'));
	Object.assign(host.style, { position: 'fixed', opacity: '0', pointerEvents: 'none' });
	function follow(): void {
		const at = place();
		Object.assign(host.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${at.width}px`, height: `${at.height}px` });
	}
	follow();
	const stopLayout = view.canvas.onLayout(follow);
	doc.addEventListener('scroll', follow, { capture: true, passive: true });
	return {
		host,
		remove() {
			stopLayout();
			doc.removeEventListener('scroll', follow, { capture: true });
			host.remove();
		}
	};
}
