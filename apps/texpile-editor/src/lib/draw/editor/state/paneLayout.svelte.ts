export class PaneLayout {
	/** it wraps in a narrow pane, and the panels start below it */
	toolbarHeight = $state(38);

	get panelsTop() {
		return 6 + this.toolbarHeight + 8;
	}
}
