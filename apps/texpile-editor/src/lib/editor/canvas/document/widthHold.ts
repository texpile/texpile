// while a split divider drags, blocks keep the old width and the frame paints the stale layout clipped (5.6)
export class WidthHold {
	private held: number | null = null;

	get holding(): boolean {
		return this.held !== null;
	}

	hold(width: number): void {
		this.held ??= width;
	}

	/** returns whether a hold ended */
	release(): boolean {
		const was = this.held !== null;
		this.held = null;
		return was;
	}

	/** the width the blocks lay out at, given the column's */
	widthFor(column: number): number {
		return this.held ?? column;
	}
}
