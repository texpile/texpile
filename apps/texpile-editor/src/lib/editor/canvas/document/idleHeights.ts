// blocks off screen are laid out in idle slices: those a scroll reaches next kept whole, the rest for their heights alone,
// nearest the viewport first (5.6)
import type { IdleScheduler, IdleSlice } from '../frame/idleScheduler';

export type IdleHeightsHost = {
	readonly count: number;
	readonly estimatedCount: number;
	estimated(index: number): boolean;
	/** lays the block out, keeps its height and lets the layout go */
	measure(index: number): void;
	/** the blocks the last frame placed */
	visible(): { first: number; last: number };
	/** the blocks within a viewport's height of the visible ones */
	ahead(): { first: number; last: number };
	/** the block has a layout a frame can draw */
	laidOut(index: number): boolean;
	/** lays the block out and keeps the layout, so the frame that scrolls to it only paints it */
	prepare(index: number): void;
	/** a slice changed heights: a frame keeps the reading place and runs onLayout */
	measured(): void;
	/** a width hold: nothing is measured at a width about to change */
	paused(): boolean;
	/** keys came in lately: a block above the viewport waits, because its height moves every row on screen */
	typing(): boolean;
};

const SLICE_MS = 4;
/** a block a scroll reaches next may take the idle period's time past SLICE_MS: a formula-heavy paragraph alone takes more */
const AHEAD_SLICE_MS = 12;
/** blocks this far either side of the viewport go before the top-down sweep */
const NEAR = 50;

export class IdleHeights {
	private cancel: (() => void) | null = null;
	private sweep = 0;

	constructor(
		private readonly host: IdleHeightsHost,
		private readonly schedule: IdleScheduler
	) {}

	/** after a frame: one slice is pending while estimated blocks remain */
	start(): void {
		if (this.cancel || (!this.host.estimatedCount && this.nextAhead(new Set()) < 0)) return;
		this.cancel = this.schedule((slice) => this.run(slice));
	}

	/** the block list changed shape: the sweep starts over */
	restart(): void {
		this.sweep = 0;
	}

	stop(): void {
		this.cancel?.();
		this.cancel = null;
	}

	private run(slice: IdleSlice): void {
		this.cancel = null;
		if (this.host.paused()) return;
		const start = performance.now();
		const tried = new Set<number>();
		while (slice.timeRemaining() > 0) {
			const elapsed = performance.now() - start;
			const ahead = elapsed < AHEAD_SLICE_MS ? this.nextAhead(tried) : -1;
			if (ahead < 0 && elapsed >= SLICE_MS) break;
			const next = ahead >= 0 ? ahead : this.next(tried);
			if (next < 0) break;
			tried.add(next);
			if (ahead >= 0) this.host.prepare(next);
			else this.host.measure(next);
		}
		if (tried.size) this.host.measured();
		if (this.nextAhead(tried) >= 0 || this.next(tried) >= 0) this.start();
	}

	/** the nearest block within a viewport of the visible ones without a layout, below before above */
	private nextAhead(tried: ReadonlySet<number>): number {
		const { host } = this;
		const { first, last } = host.visible();
		const ahead = host.ahead();
		for (let distance = 1; last + distance <= ahead.last || first - distance >= ahead.first; distance++)
			for (const i of [last + distance, first - distance])
				if (i >= ahead.first && i <= ahead.last && i >= 0 && i < host.count && !tried.has(i) && !host.laidOut(i)) return i;
		return -1;
	}

	private next(tried: ReadonlySet<number>): number {
		const { host } = this;
		function wanted(i: number): boolean {
			return i >= 0 && i < host.count && !tried.has(i) && host.estimated(i);
		}
		const { first, last } = host.visible();
		const typing = host.typing();
		for (let distance = 0; distance <= NEAR; distance++) {
			if (wanted(last + distance)) return last + distance;
			if ((!typing || !distance) && wanted(first - distance)) return first - distance;
		}
		if (typing) {
			for (let i = Math.max(this.sweep, last + 1); i < host.count; i++) if (wanted(i)) return i;
			return -1;
		}
		for (; this.sweep < host.count; this.sweep++) if (wanted(this.sweep)) return this.sweep;
		return -1;
	}
}
