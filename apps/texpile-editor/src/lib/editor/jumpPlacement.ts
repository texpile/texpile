import { scrollParent } from '$lib/editor/visual/scrollParent';

export type VerticalSpan = { top: number; bottom: number };

export function jumpScrollShift(target: VerticalSpan, viewport: VerticalSpan): number | null {
	if (target.top >= viewport.top && target.bottom <= viewport.bottom) return null;
	return (target.top + target.bottom) / 2 - (viewport.top + viewport.bottom) / 2;
}

export function revealElementInCenter(el: Element, behavior: ScrollBehavior = 'auto'): void {
	const scroller = scrollParent(el as HTMLElement);
	if (!scroller) return;
	const shift = jumpScrollShift(el.getBoundingClientRect(), scroller.getBoundingClientRect());
	if (shift != null) scroller.scrollTo({ top: scroller.scrollTop + shift, behavior });
}
