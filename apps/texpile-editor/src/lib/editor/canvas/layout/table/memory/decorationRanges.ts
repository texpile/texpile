import type { FrameDecorations } from '../../../contracts/decorationTypes';

/** the document ranges a frame's inline and widget decorations touch, to ask whether one stands inside a stretch */
export class DecorationRanges {
	private readonly starts: number[] = [];
	private readonly reach: number[] = [];

	constructor(decorations: FrameDecorations) {
		const ranges: [number, number][] = [];
		for (const { from, to } of decorations.inline) ranges.push([from, to]);
		for (const { pos } of decorations.widgets) ranges.push([pos, pos]);
		ranges.sort((a, b) => a[0] - b[0]);
		let furthest = -Infinity;
		for (const [from, to] of ranges) {
			furthest = Math.max(furthest, to);
			this.starts.push(from);
			this.reach.push(furthest);
		}
	}

	/** a decoration starts by `to` and reaches `from` */
	touches(from: number, to: number): boolean {
		let low = 0;
		let high = this.starts.length;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (this.starts[mid] <= to) low = mid + 1;
			else high = mid;
		}
		return low > 0 && this.reach[low - 1] >= from;
	}
}
