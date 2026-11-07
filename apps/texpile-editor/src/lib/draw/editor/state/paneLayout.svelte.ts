const COMPACT_WIDTH = 640;

export class PaneLayout {
	/** it wraps in a narrow pane, and the panels start below it */
	toolbarHeight = $state(38);
	width = $state(Number.POSITIVE_INFINITY);
	readonly compact = $derived(this.width < COMPACT_WIDTH);
	objectsShown = $state(false);

	get panelsTop() {
		return 6 + this.toolbarHeight + 8;
	}
}
