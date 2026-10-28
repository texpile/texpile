// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/iterables/DiffIterableUtil.kt

import { type Change, buildChangesForInts, buildChangesForObjects } from '../lcs/diff';
import { check } from '../lcs/check';
import { FilesTooBigForDiffError } from '../lcs/filesTooBigForDiffError';
import type { Hashable } from '../ranges/enumerator';
import { Range } from '../ranges/range';
import {
	type DiffIterable,
	type FairDiffIterable,
	FairDiffIterableWrapper,
	InvertedDiffIterable,
	RangesDiffIterable
} from './diffIterable';
import { DiffTooBigError } from './diffTooBigError';

export function diffInts(data1: Int32Array, data2: Int32Array): FairDiffIterable {
	return diffWith(() => buildChangesForInts(data1, data2), data1.length, data2.length);
}

export function diffObjects<T extends Hashable>(objects1: readonly T[], objects2: readonly T[]): FairDiffIterable {
	return diffWith(() => buildChangesForObjects(objects1, objects2), objects1.length, objects2.length);
}

function diffWith(build: () => Change | null, length1: number, length2: number): FairDiffIterable {
	try {
		return fair(createFromChange(build(), length1, length2));
	} catch (error) {
		if (error instanceof FilesTooBigForDiffError) throw new DiffTooBigError();
		throw error;
	}
}

export function createFromChange(change: Change | null, length1: number, length2: number): DiffIterable {
	const ranges: Range[] = [];
	for (let current = change; current; current = current.link) {
		ranges.push(new Range(current.line0, current.line0 + current.deleted, current.line1, current.line1 + current.inserted));
	}
	return new RangesDiffIterable(ranges, length1, length2);
}

export function create(ranges: readonly Range[], length1: number, length2: number): DiffIterable {
	return new RangesDiffIterable(ranges, length1, length2);
}

export function createUnchanged(ranges: readonly Range[], length1: number, length2: number): DiffIterable {
	return new InvertedDiffIterable(create(ranges, length1, length2));
}

export function fair(iterable: DiffIterable): FairDiffIterable {
	if (iterable.isFair) return iterable as FairDiffIterable;
	return new FairDiffIterableWrapper(iterable);
}

export class ChangeBuilder {
	private readonly changeRanges: Range[] = [];
	private index1 = 0;
	private index2 = 0;

	constructor(
		private readonly length1: number,
		private readonly length2: number
	) {}

	markEqual(index1: number, index2: number, end1?: number, end2?: number): void {
		const equalEnd1 = end1 ?? index1 + 1;
		const equalEnd2 = end2 ?? index2 + 1;
		if (index1 === equalEnd1 && index2 === equalEnd2) return;

		check(this.index1 <= index1);
		check(this.index2 <= index2);
		check(index1 <= equalEnd1);
		check(index2 <= equalEnd2);

		if (this.index1 !== index1 || this.index2 !== index2) {
			this.changeRanges.push(new Range(this.index1, index1, this.index2, index2));
		}
		this.index1 = equalEnd1;
		this.index2 = equalEnd2;
	}

	finish(): DiffIterable {
		check(this.index1 <= this.length1);
		check(this.index2 <= this.length2);

		if (this.length1 !== this.index1 || this.length2 !== this.index2) {
			this.changeRanges.push(new Range(this.index1, this.length1, this.index2, this.length2));
			this.index1 = this.length1;
			this.index2 = this.length2;
		}
		return create(this.changeRanges, this.length1, this.length2);
	}
}
