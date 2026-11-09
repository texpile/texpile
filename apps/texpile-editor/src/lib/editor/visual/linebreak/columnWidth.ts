// the width of the column the visual editor sits in, as the line breaker follows it

// how long the width has to hold still before the document is broken again
const WIDTH_REST_MS = 150;

type ColumnWidthHooks = {
	/** break the whole document for the width it has now; `nextFrame` from an observer, which may not change heights */
	breakNow(nextFrame: boolean): void;
	/** the width keeps moving: keep the editor at the width its lines were broken for */
	hold(): void;
	/** the width came to rest after moving */
	rest(): void;
};

/** a width that changes once (the comment margin opening) is broken for at once. A splitter drag or a window resize
 *  changes it every frame, and breaking a long document, or letting the browser wrap it, every frame is what made
 *  dragging slow; the editor holds its width until the width rests */
export class ColumnWidth {
	moving = false;
	private width = -1;
	private lastChange = -Infinity;
	private restTimer = 0;
	private readonly observer = new ResizeObserver(() => this.changed(true));

	constructor(
		private readonly column: HTMLElement,
		private readonly hooks: ColumnWidthHooks
	) {
		this.observer.observe(column);
	}

	changed(observed = false): void {
		const width = this.column.clientWidth;
		if (width === this.width) return;
		// an editor built before it had a place on the page has nothing drawn yet, so nothing to hold back
		if (this.width <= 0) return this.hooks.breakNow(true);
		this.width = width;
		clearTimeout(this.restTimer);
		const now = performance.now();
		const moving = now - this.lastChange < WIDTH_REST_MS;
		this.lastChange = now;
		if (!moving && !this.moving) return this.hooks.breakNow(observed);
		this.restTimer = window.setTimeout(() => this.hooks.rest(), WIDTH_REST_MS);
		if (this.moving) return;
		this.moving = true;
		requestAnimationFrame(() => this.hooks.hold());
	}

	/** the document is about to be broken for the width the column has now */
	breaking(): void {
		this.moving = false;
		this.width = this.column.clientWidth;
	}

	/** the rest is counted from here: a drag's next step comes only once a slow break is done, and must still count as
	 *  moving */
	broken(): void {
		this.lastChange = performance.now();
	}

	destroy(): void {
		clearTimeout(this.restTimer);
		this.observer.disconnect();
	}
}
