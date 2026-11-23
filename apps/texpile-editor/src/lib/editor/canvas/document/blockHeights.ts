// top-level block tops as a Fenwick tree over block pitch, root margins collapsed between neighbours (5.6)

export type BlockMeasure = { height: number; marginTop: number; marginBottom: number; estimated: boolean };

/** two adjoining vertical margins as CSS collapses them */
export function collapsedMargin(a: number, b: number): number {
	return Math.max(a, b, 0) + Math.min(a, b, 0);
}

/** prefix sums with O(log n) point updates and searches */
export class FenwickSums {
	private tree: Float64Array;

	constructor(values: ArrayLike<number>) {
		this.tree = new Float64Array(values.length + 1);
		for (let i = 0; i < values.length; i++) {
			this.tree[i + 1] += values[i];
			const parent = i + 1 + ((i + 1) & -(i + 1));
			if (parent <= values.length) this.tree[parent] += this.tree[i + 1];
		}
	}

	get size(): number {
		return this.tree.length - 1;
	}

	add(index: number, delta: number): void {
		for (let i = index + 1; i < this.tree.length; i += i & -i) this.tree[i] += delta;
	}

	/** the sum of values [0, end) */
	prefix(end: number): number {
		let sum = 0;
		for (let i = end; i > 0; i -= i & -i) sum += this.tree[i];
		return sum;
	}

	/** the largest count of leading values whose sum is at most target */
	countWithin(target: number): number {
		let at = 0;
		let left = target;
		for (let step = 1 << Math.floor(Math.log2(Math.max(1, this.size))); step; step >>= 1)
			if (at + step <= this.size && this.tree[at + step] <= left) {
				at += step;
				left -= this.tree[at];
			}
		return at;
	}
}

export class BlockHeights {
	private measures: BlockMeasure[] = [];
	/** what set's step added to a block's pitch, under half a step */
	private biases: number[] = [];
	private pitches = new FenwickSums([]);
	private estimates = new FenwickSums([]);

	get count(): number {
		return this.measures.length;
	}

	/** all blocks at once */
	reset(measures: BlockMeasure[]): void {
		this.measures = measures;
		this.biases = [];
		this.pitches = new FenwickSums(measures.map((_, i) => this.pitchOf(i)));
		this.estimates = new FenwickSums(measures.map((m) => (m.estimated ? 1 : 0)));
	}

	/** the blocks [from, from + removed) replaced by these: point updates when the count holds, else one O(n) rebuild */
	splice(from: number, removed: number, measures: BlockMeasure[]): void {
		if (removed !== measures.length) {
			const biases = [...this.biases.slice(0, from), ...measures.map(() => 0), ...this.biases.slice(from + removed)];
			this.measures = [...this.measures.slice(0, from), ...measures, ...this.measures.slice(from + removed)];
			this.biases = biases;
			this.pitches = new FenwickSums(this.measures.map((_, i) => this.pitchOf(i)));
			this.estimates = new FenwickSums(this.measures.map((m) => (m.estimated ? 1 : 0)));
			return;
		}
		measures.forEach((measure, i) => this.set(from + i, measure));
	}

	get estimatedCount(): number {
		return this.estimates.prefix(this.measures.length);
	}

	measureOf(index: number): BlockMeasure {
		return this.measures[index];
	}

	/** returns how far the blocks after it moved; with a step, by a whole number of steps (the block's pitch absorbs the rest) */
	set(index: number, measure: BlockMeasure, step?: number): number {
		const before = this.top(index + 1).y;
		const was = this.measures[index];
		this.measures[index] = measure;
		this.biases[index] = 0;
		this.pitches.add(index, this.pitchOf(index) - this.pitches.prefix(index + 1) + this.pitches.prefix(index));
		if (index > 0) this.pitches.add(index - 1, this.pitchOf(index - 1) - this.pitches.prefix(index) + this.pitches.prefix(index - 1));
		if (was.estimated !== measure.estimated) this.estimates.add(index, measure.estimated ? 1 : -1);
		const moved = this.top(index + 1).y - before;
		if (!step) return moved;
		const bias = Math.round(moved / step) * step - moved;
		this.biases[index] = bias;
		this.pitches.add(index, bias);
		return moved + bias;
	}

	/** a block's pitch: its height and the collapsed margin to the next one (its own bottom margin when last) */
	private pitchOf(index: number): number {
		const m = this.measures[index];
		const next = this.measures[index + 1];
		return m.height + (next ? collapsedMargin(m.marginBottom, next.marginTop) : m.marginBottom) + (this.biases[index] ?? 0);
	}

	/** the first block's top margin stays inside the root, which is a formatting context of its own */
	private get lead(): number {
		return this.measures[0]?.marginTop ?? 0;
	}

	top(index: number): { y: number; estimated: boolean } {
		return { y: this.lead + this.pitches.prefix(index), estimated: this.estimates.prefix(index) > 0 };
	}

	get total(): number {
		return this.lead + this.pitches.prefix(this.measures.length);
	}

	/** the block whose pitch holds y, clamped to the first and last */
	indexAt(y: number): number {
		if (!this.measures.length) return 0;
		return Math.min(this.measures.length - 1, this.pitches.countWithin(y - this.lead));
	}
}
