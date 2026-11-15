// the width of a pane's column: one change, or a stream of them that comes to rest
import { dividerDragging, onDividerRelease, windowResizedAt } from './edgeDrag';

// how long the width has to hold still before the pane redraws for it
const WIDTH_REST_MS = 150;

type ColumnWidthHooks = {
	/** redraw for the width it has now; `nextFrame` from an observer, which may not change heights */
	breakNow(nextFrame: boolean): void;
	/** the width keeps moving: hold what is drawn until it rests */
	hold(): void;
	/** the width came to rest after moving */
	rest(): void;
};

/** a width that changes once (the comment margin opening) is redrawn for at once. A divider drag or a window resize
 *  changes it every frame, and re-breaking a long document every frame is what made dragging slow; the pane holds
 *  from the drag's first step until the divider is let go or the width rests */
export class ColumnWidth {
	moving = false;
	private width = -1;
	private lastChange = -Infinity;
	private restTimer = 0;
	private drawnFrame = 0;
	private readonly observer = new ResizeObserver(() => this.changed(true));
	private readonly unwatchRelease = onDividerRelease(() => this.released());

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
		const dragged = dividerDragging();
		const moving = dragged || now - Math.max(this.lastChange, windowResizedAt()) < WIDTH_REST_MS;
		this.lastChange = now;
		if (!moving && !this.moving) return this.hooks.breakNow(observed);
		// a divider held still is still held: its pane rests on the release
		if (!dragged) this.restTimer = window.setTimeout(() => this.hooks.rest(), WIDTH_REST_MS);
		if (this.moving) return;
		this.moving = true;
		requestAnimationFrame(() => this.hooks.hold());
	}

	/** the document is about to be broken for the width the column has now */
	breaking(): void {
		this.moving = false;
		this.width = this.column.clientWidth;
	}

	/** the rest is counted from the frame after the break: a resize's next step comes only once a slow break is done
	 *  and drawn, and must still count as moving */
	broken(): void {
		this.lastChange = performance.now();
		cancelAnimationFrame(this.drawnFrame);
		this.drawnFrame = requestAnimationFrame(() => (this.lastChange = performance.now()));
	}

	private released(): void {
		if (!this.moving) return;
		clearTimeout(this.restTimer);
		this.hooks.rest();
	}

	destroy(): void {
		clearTimeout(this.restTimer);
		cancelAnimationFrame(this.drawnFrame);
		this.observer.disconnect();
		this.unwatchRelease();
	}
}
