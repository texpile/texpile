// scrolls while a drag is held at or past the edge of a scroll area, and runs the move again at the last point (G6)
import { autoscrollSpeed } from './autoscrollSpeed';

/** on the selection a drag moves: the autoscroll owns the scroll, so no reveal of the head runs */
export const POINTER_DRAG_META = 'pointerDrag';

export type ScrollTarget = {
	readonly axis: 'x' | 'y';
	/** the visible edges in client space */
	rect(): { start: number; end: number };
	/** the size one screen of it covers */
	screen(): number;
	/** scrolls by `delta` px and returns how far it moved */
	scrollBy(delta: number): number;
};

export type AutoscrollParts = {
	targets(): readonly ScrollTarget[];
	/** the drag's move at the pointer's last client point, once a target scrolled */
	rerun(point: { x: number; y: number }): void;
	now?(): number;
	frame?(callback: (time: number) => void): number;
	cancel?(handle: number): void;
};

const LINE_PX = 24;

type Zone = { target: ScrollTarget; dir: -1 | 1; overshoot: number };

export class Autoscroll {
	private point: { x: number; y: number } | null = null;
	private handle = 0;
	private last = 0;
	private heldSince: number | null = null;
	private carry = 0;

	constructor(private readonly parts: AutoscrollParts) {}

	get running(): boolean {
		return this.handle !== 0;
	}

	/** the pointer moved: starts the loop when it is in a band or past an edge, ends it when it left */
	update(point: { x: number; y: number }): void {
		this.point = point;
		const zone = this.zoneAt(point);
		if (!zone) {
			this.stop();
			return;
		}
		if (this.handle === 0) {
			this.last = this.clock();
			this.heldSince = this.last;
			this.handle = this.request(this.step);
		}
	}

	stop(): void {
		if (this.handle !== 0) (this.parts.cancel ?? cancelAnimationFrame)(this.handle);
		this.handle = 0;
		this.heldSince = null;
		this.carry = 0;
		this.point = null;
	}

	private clock(): number {
		return (this.parts.now ?? performance.now.bind(performance))();
	}

	private request(callback: (time: number) => void): number {
		return (this.parts.frame ?? requestAnimationFrame)(callback);
	}

	private zoneAt(point: { x: number; y: number }): Zone | null {
		let best: Zone | null = null;
		for (const target of this.parts.targets()) {
			const { start, end } = target.rect();
			const at = target.axis === 'y' ? point.y : point.x;
			const past =
				at < start + LINE_PX
					? ({ dir: -1, overshoot: start - at } as const)
					: at > end - LINE_PX
						? ({ dir: 1, overshoot: at - end } as const)
						: null;
			if (past && (!best || past.overshoot > best.overshoot)) best = { target, ...past };
		}
		return best;
	}

	private readonly step = (): void => {
		const { point } = this;
		const zone = point && this.zoneAt(point);
		if (!point || !zone) {
			this.stop();
			return;
		}
		const now = this.clock();
		const dt = Math.min(64, Math.max(0, now - this.last));
		this.last = now;
		const speed = autoscrollSpeed(zone.overshoot, now - (this.heldSince ?? now), zone.target.screen(), LINE_PX);
		this.carry += (zone.dir * speed * dt) / 1000;
		const whole = Math.trunc(this.carry);
		this.carry -= whole;
		// next frame first: the replayed move reaches update(), which starts a loop only when none is queued
		this.handle = this.request(this.step);
		if (whole !== 0 && zone.target.scrollBy(whole) !== 0) this.parts.rerun(point);
	};
}
