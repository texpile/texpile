/**
 * The nearest ancestor that actually scrolls, or null when nothing does.
 *
 * The `scrollHeight > clientHeight` test is part of the answer, not an optimisation: the editor's
 * scroller carries `overflow-auto` at all times, so a short document would otherwise return a
 * container that cannot scroll and cannot therefore be hiding anything.
 */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
	let cur = el?.parentElement ?? null;
	while (cur) {
		const oy = getComputedStyle(cur).overflowY;
		if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
		cur = cur.parentElement;
	}
	return null;
}
