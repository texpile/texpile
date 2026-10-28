// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ComparisonMergeUtil.kt

import type { FairDiffIterable } from '../iterables/diffIterable';
import { check } from '../lcs/check';
import { MergeRange } from '../ranges/mergeRange';
import type { Range } from '../ranges/range';
import { Side, sideFromLeft } from '../ranges/side';

export function buildSimple(fragments1: FairDiffIterable, fragments2: FairDiffIterable): MergeRange[] {
	check(fragments1.length1 === fragments2.length1);
	return executeFairMerge(fragments1, fragments2);
}

function executeFairMerge(fragments1: FairDiffIterable, fragments2: FairDiffIterable): MergeRange[] {
	const changesBuilder = new ChangeBuilder();
	const unchanged1 = fragments1.unchanged();
	const unchanged2 = fragments2.unchanged();
	let index1 = 0;
	let index2 = 0;

	while (index1 < unchanged1.length && index2 < unchanged2.length) {
		const side = addEqualRanges(changesBuilder, unchanged1[index1], unchanged2[index2]);
		if (side === Side.LEFT) index1++;
		else index2++;
	}

	return changesBuilder.finish(fragments1.length2, fragments1.length1, fragments2.length2);
}

function addEqualRanges(changesBuilder: ChangeBuilder, range1: Range, range2: Range): Side {
	const start1 = range1.start1;
	const end1 = range1.end1;

	const start2 = range2.start1;
	const end2 = range2.end1;

	if (end1 <= start2) return Side.LEFT;
	if (end2 <= start1) return Side.RIGHT;

	const startBase = Math.max(start1, start2);
	const endBase = Math.min(end1, end2);
	const count = endBase - startBase;

	const startShift1 = startBase - start1;
	const startShift2 = startBase - start2;

	const startLeft = range1.start2 + startShift1;
	const endLeft = startLeft + count;
	const startRight = range2.start2 + startShift2;
	const endRight = startRight + count;

	changesBuilder.markEqual(startLeft, startBase, startRight, endLeft, endBase, endRight);

	return sideFromLeft(end1 <= end2);
}

class ChangeBuilder {
	private readonly changes: MergeRange[] = [];

	private index1 = 0;
	private index2 = 0;
	private index3 = 0;

	markEqual(start1: number, start2: number, start3: number, end1: number, end2: number, end3: number): void {
		check(this.index1 <= start1);
		check(this.index2 <= start2);
		check(this.index3 <= start3);
		check(start1 <= end1);
		check(start2 <= end2);
		check(start3 <= end3);

		this.addChange(this.index1, this.index2, this.index3, start1, start2, start3);

		this.index1 = end1;
		this.index2 = end2;
		this.index3 = end3;
	}

	finish(length1: number, length2: number, length3: number): MergeRange[] {
		check(this.index1 <= length1);
		check(this.index2 <= length2);
		check(this.index3 <= length3);

		this.addChange(this.index1, this.index2, this.index3, length1, length2, length3);

		return this.changes;
	}

	private addChange(start1: number, start2: number, start3: number, end1: number, end2: number, end3: number): void {
		if (start1 === end1 && start2 === end2 && start3 === end3) return;
		this.changes.push(new MergeRange(start1, end1, start2, end2, start3, end3));
	}
}
