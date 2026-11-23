// the document places overlays stand on, mapped through every transaction (12.1)
import type { Mappable } from 'prosemirror-transform';

/** a point (to === from) or a range; dead once the edit deleted what it stood on */
export type TrackedRange = { from: number; to: number; dead: boolean };

export class TrackedPositions {
	private readonly live = new Set<TrackedRange>();

	track(from: number, to = from): TrackedRange {
		const range = { from, to, dead: false };
		this.live.add(range);
		return range;
	}

	forget(range: TrackedRange): void {
		this.live.delete(range);
	}

	/** null: a document replaced with no mapping from the old one, where nothing can be followed */
	map(mapping: Mappable | null): void {
		if (!mapping) {
			this.lose();
			return;
		}
		for (const range of this.live) {
			if (range.to === range.from) {
				const at = mapping.mapResult(range.from, 1);
				range.from = range.to = at.pos;
				range.dead = at.deletedAcross;
			} else {
				const from = mapping.map(range.from, 1);
				const to = mapping.map(range.to, -1);
				range.from = from;
				range.to = Math.max(from, to);
				range.dead = to <= from;
			}
			if (range.dead) this.live.delete(range);
		}
	}

	private lose(): void {
		for (const range of this.live) range.dead = true;
		this.live.clear();
	}

	get size(): number {
		return this.live.size;
	}
}
