import type { Viewport } from '../state/viewport.svelte';

/** Ctrl or a pinch zooms around the pointer, anything else pans; not passive, so the page itself stays put. A panel
 *  over the canvas that scrolls (`data-own-scroll`) keeps its own wheel */
export function wheelNavigation(viewport: Viewport) {
	return (el: HTMLElement) => {
		function onwheel(e: WheelEvent) {
			if (!e.ctrlKey && !e.metaKey && (e.target as Element).closest('[data-own-scroll]')) return;
			e.preventDefault();
			const r = el.getBoundingClientRect();
			if (e.ctrlKey || e.metaKey) viewport.zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX - r.left, e.clientY - r.top);
			// a mac turns a wheel's Shift into a sideways scroll itself
			else if (e.shiftKey) viewport.panBy(-(e.deltaY || e.deltaX), 0);
			else viewport.panBy(-e.deltaX, -e.deltaY);
		}
		el.addEventListener('wheel', onwheel, { passive: false });
		return () => el.removeEventListener('wheel', onwheel);
	};
}

/** a pinch over the panes zooms the canvas's view, never the page under the editor */
export function blockPageZoom(el: HTMLElement) {
	function onwheel(e: WheelEvent) {
		if (e.ctrlKey || e.metaKey) e.preventDefault();
	}
	el.addEventListener('wheel', onwheel, { passive: false });
	return () => el.removeEventListener('wheel', onwheel);
}
