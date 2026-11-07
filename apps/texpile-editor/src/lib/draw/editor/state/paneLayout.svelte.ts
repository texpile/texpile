// below it the stage takes Excalidraw's phone layout: one row of tools, the inspector docked at the foot
const COMPACT_WIDTH = 640;

export class PaneLayout {
	/** it wraps in a narrow pane, and the panels start below it */
	toolbarHeight = $state(38);
	width = $state(Number.POSITIVE_INFINITY);
	readonly compact = $derived(this.width < COMPACT_WIDTH);
	/** the objects list, opened from the foot in the compact layout */
	objectsShown = $state(false);

	get panelsTop() {
		return 6 + this.toolbarHeight + 8;
	}
}
