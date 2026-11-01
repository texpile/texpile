// close to the tab strip and as short as its controls, for the height of the text under it; the strut holds one height
// whatever is in the bar and whatever its border snaps to
export const floatingBarClass =
	"bg-surface-50-950 border-surface-200-800 rounded-container @container absolute top-1.5 left-1/2 z-20 flex w-[min(62rem,calc(100%-0.75rem))] -translate-x-1/2 items-center border px-2 py-0.5 shadow-lg before:h-7 before:content-['']";
export const FLOATING_BAR_BOTTOM = 40;

const GAP = 8;

// level with the bar when the pane has room beside it
export function hangFindBelow(bar: HTMLElement): (() => void) | undefined {
	const pane = bar.parentElement;
	if (!pane) return;
	function place(): void {
		const style = getComputedStyle(pane!);
		const needs = parseFloat(style.getPropertyValue('--find-widget-width')) + parseFloat(style.getPropertyValue('--find-right')) + GAP;
		const room = pane!.getBoundingClientRect().right - bar.getBoundingClientRect().right;
		const top = room >= needs ? `${bar.offsetTop}px` : `calc(${bar.offsetTop + bar.offsetHeight}px + var(--spacing) * 1.5)`;
		pane!.style.setProperty('--find-top', top);
	}
	const ro = new ResizeObserver(place);
	ro.observe(bar);
	ro.observe(pane);
	place();
	return () => {
		ro.disconnect();
		pane.style.removeProperty('--find-top');
	};
}
