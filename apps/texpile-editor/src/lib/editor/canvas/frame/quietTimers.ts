// the frame loop's two pauses: a view nobody scrolls or types in keeps the layouts a scroll reaches next and lets the
// rest go, and a pause in typing lets idle slices measure the blocks above the viewport again
const REST_MS = 3000;
const TYPING_MS = 1000;

export class QuietTimers {
	private restTimer = 0;
	private typingTimer = 0;
	private typedAt = -Infinity;

	constructor(
		private readonly win: Window,
		private readonly onRest: () => void,
		private readonly afterTyping: { start(): void }
	) {}

	get typing(): boolean {
		return performance.now() - this.typedAt < TYPING_MS;
	}

	typed(): void {
		this.typedAt = performance.now();
		this.win.clearTimeout(this.typingTimer);
		this.typingTimer = this.win.setTimeout(() => this.afterTyping.start(), TYPING_MS);
	}

	/** after a frame: the rest starts over */
	painted(): void {
		this.win.clearTimeout(this.restTimer);
		this.restTimer = this.win.setTimeout(this.onRest, REST_MS);
	}

	destroy(): void {
		this.win.clearTimeout(this.restTimer);
		this.win.clearTimeout(this.typingTimer);
	}
}
