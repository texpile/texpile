// what probe.frameStats() reports: the perf gate's numbers (0.5, 18.4)
const KEPT_KEY_TIMES = 200;

export type FrameStatsReport = {
	frames: number;
	lastLayoutMs: number;
	lastPaintMs: number;
	blocksLaidOut: number;
	keyToFrameMs: number[];
	styleReads: number;
	/** ms spent resolving element styles since the view opened */
	styleMs: number;
	/** ms of the theme token and ground reads since the view opened */
	themeReadMs: number;
	/** ms the frames spent resolving styles up to the first screen (the ready gate's frame) */
	firstScreenStyleMs: number | null;
	/** device pixels the last frame painted, rows ahead painted in idle slices left out */
	lastPaintedPx: number;
	/** rows that came on screen unpainted, since the view opened */
	lateRows: number;
	/** device pixels the content rows hold */
	rowPixels: number;
};

export class FrameStats {
	frames = 0;
	lastLayoutMs = 0;
	lastPaintMs = 0;
	blocksLaidOut = 0;
	lastPaintedPx = 0;
	lateRows = 0;
	rowPixels = 0;
	firstScreenStyleMs: number | null = null;
	private framesStyleMs = 0;
	private readonly keyTimes: number[] = [];
	/** the earliest input no painted frame answered yet */
	private pendingInput: number | null = null;

	/** the frames' own style time up to the first screen; idle slices laying out blocks ahead are left out */
	noteFrameStyle(styleMs: number): void {
		if (this.firstScreenStyleMs === null) this.framesStyleMs += styleMs;
	}

	noteFirstScreen(): void {
		this.firstScreenStyleMs ??= this.framesStyleMs;
	}

	noteInput(at: number): void {
		this.pendingInput ??= at;
	}

	framePainted(layoutMs: number, paintMs: number, laidOut: number, now: number): void {
		this.frames++;
		this.lastLayoutMs = layoutMs;
		this.lastPaintMs = paintMs;
		this.blocksLaidOut = laidOut;
		if (this.pendingInput === null) return;
		this.keyTimes.push(now - this.pendingInput);
		if (this.keyTimes.length > KEPT_KEY_TIMES) this.keyTimes.shift();
		this.pendingInput = null;
	}

	notePaint(paintedPx: number, lateRows: number, rowPixels: number): void {
		this.lastPaintedPx = paintedPx;
		this.lateRows = lateRows;
		this.rowPixels = rowPixels;
	}

	report(styles: { readonly reads: number; readonly styleMs: number; readonly themeReadMs: number }): FrameStatsReport {
		const { frames, lastLayoutMs, lastPaintMs, blocksLaidOut, lastPaintedPx, lateRows, rowPixels } = this;
		return {
			frames,
			lastLayoutMs,
			lastPaintMs,
			blocksLaidOut,
			keyToFrameMs: [...this.keyTimes],
			styleReads: styles.reads,
			styleMs: styles.styleMs,
			themeReadMs: styles.themeReadMs,
			firstScreenStyleMs: this.firstScreenStyleMs,
			lastPaintedPx,
			lateRows,
			rowPixels
		};
	}
}
