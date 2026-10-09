// the editors' find boxes hang below the floating format bar, whose height depends on the toolbar in it
export function hangFindBelow(bar: HTMLElement): (() => void) | undefined {
	const pane = bar.parentElement;
	if (!pane) return;
	function place(): void {
		pane!.style.setProperty('--find-top', `calc(${bar.offsetTop + bar.offsetHeight}px + var(--spacing) * 2)`);
	}
	const ro = new ResizeObserver(place);
	ro.observe(bar);
	place();
	return () => {
		ro.disconnect();
		pane.style.removeProperty('--find-top');
	};
}
