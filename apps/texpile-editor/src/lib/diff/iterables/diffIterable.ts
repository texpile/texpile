// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/iterables/DiffIterable.kt

import { check } from '../lcs/check';
import { Range } from '../ranges/range';

export type DiffIterable = {
	readonly length1: number;
	readonly length2: number;
	changes(): Range[];
	unchanged(): Range[];
	// set on iterables whose unchanged ranges match element by element
	readonly isFair?: true;
};

export type FairDiffIterable = DiffIterable & { readonly isFair: true };

export class RangesDiffIterable implements DiffIterable {
	constructor(
		private readonly ranges: readonly Range[],
		readonly length1: number,
		readonly length2: number
	) {}

	changes(): Range[] {
		return this.ranges.slice();
	}

	unchanged(): Range[] {
		const changes = this.ranges;
		const result: Range[] = [];
		let last1 = 0;
		let last2 = 0;
		let index = 0;

		if (changes.length > 0 && changes[0].start1 === 0 && changes[0].start2 === 0) {
			last1 = changes[0].end1;
			last2 = changes[0].end2;
			index = 1;
		}

		while (index < changes.length || last1 !== this.length1 || last2 !== this.length2) {
			if (index < changes.length) {
				const change = changes[index];
				check(change.start1 >= last1 || change.start2 >= last2);
				result.push(new Range(last1, change.start1, last2, change.start2));
				last1 = change.end1;
				last2 = change.end2;
				index++;
			} else {
				check(this.length1 - last1 !== 0 || this.length2 - last2 !== 0);
				result.push(new Range(last1, this.length1, last2, this.length2));
				last1 = this.length1;
				last2 = this.length2;
			}
		}
		return result;
	}
}

export class InvertedDiffIterable implements DiffIterable {
	constructor(private readonly inner: DiffIterable) {}

	get length1(): number {
		return this.inner.length1;
	}

	get length2(): number {
		return this.inner.length2;
	}

	changes(): Range[] {
		return this.inner.unchanged();
	}

	unchanged(): Range[] {
		return this.inner.changes();
	}
}

export class FairDiffIterableWrapper implements FairDiffIterable {
	readonly isFair = true as const;

	constructor(private readonly inner: DiffIterable) {}

	get length1(): number {
		return this.inner.length1;
	}

	get length2(): number {
		return this.inner.length2;
	}

	changes(): Range[] {
		return this.inner.changes();
	}

	unchanged(): Range[] {
		return this.inner.unchanged();
	}
}
