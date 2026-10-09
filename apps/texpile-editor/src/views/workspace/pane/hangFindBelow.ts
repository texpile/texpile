// the editors' find boxes stand level with the floating format bar when the pane has room for one beside it, else
// hang below it, whose height depends on the toolbar in it
const GAP = 8;

export function hangFindBelow(bar: HTMLElement): (() => void) | undefined {
	const pane = bar.parentElement;
	if (!pane) return;
	function place(): void {
		const style = getComputedStyle(pane!);
		const needs = parseFloat(style.getPropertyValue('--find-widget-width')) + parseFloat(style.getPropertyValue('--find-right')) + GAP;
		const room = pane!.getBoundingClientRect().right - bar.getBoundingClientRect().right;
		const top = room >= needs ? `${bar.offsetTop}px` : `calc(${bar.offsetTop + bar.offsetHeight}px + var(--spacing) * 2)`;
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
