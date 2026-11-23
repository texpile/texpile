// one blink timer per editor: it repaints the caret layer alone, and a move or an input starts it visible again (6.4)
/** the native caret's half period: Windows' GetCaretBlinkTime, Chromium's default elsewhere until P0 records them (D38) */
export const CARET_HALF_PERIOD_MS = typeof navigator !== 'undefined' && /Win/.test(navigator.platform) ? 530 : 500;

export type BlinkClock = {
	now(): number;
	setTimeout(run: () => void, ms: number): number;
	clearTimeout(id: number): void;
};

const WINDOW_CLOCK: BlinkClock = {
	now: () => performance.now(),
	setTimeout: (run, ms) => window.setTimeout(run, ms),
	clearTimeout: (id) => window.clearTimeout(id)
};

export class CaretBlink {
	private started: number;
	private timer: number | null = null;

	constructor(
		private readonly repaint: () => void,
		private readonly clock: BlinkClock = WINDOW_CLOCK
	) {
		this.started = clock.now();
	}

	/** ms since the caret last started visible */
	get elapsed(): number {
		return this.clock.now() - this.started;
	}

	restart(): void {
		this.started = this.clock.now();
	}

	/** the native caret's phase now */
	visible(halfPeriodMs = CARET_HALF_PERIOD_MS): boolean {
		return Math.floor(this.elapsed / halfPeriodMs) % 2 === 0;
	}

	/** asks for the caret layer again when the earliest drawn look next changes; null stops */
	schedule(nextMs: number | null): void {
		if (this.timer !== null) this.clock.clearTimeout(this.timer);
		this.timer = null;
		if (nextMs === null) return;
		this.timer = this.clock.setTimeout(
			() => {
				this.timer = null;
				this.repaint();
			},
			Math.max(1, Math.ceil(nextMs))
		);
	}

	/** ms until the native caret's phase flips */
	nextFlip(halfPeriodMs = CARET_HALF_PERIOD_MS): number {
		return halfPeriodMs - (this.elapsed % halfPeriodMs);
	}

	destroy(): void {
		this.schedule(null);
	}
}
