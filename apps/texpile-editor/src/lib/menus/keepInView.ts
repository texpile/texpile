/** scrolls a row into its list's view while `shown`: the row the arrow keys are on */
export function keepInView(row: HTMLElement, shown: boolean) {
	function show(now: boolean): void {
		if (now) row.scrollIntoView?.({ block: 'nearest' });
	}
	show(shown);
	return { update: show };
}
