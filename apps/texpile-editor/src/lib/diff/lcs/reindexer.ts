// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/Reindexer.kt

import { BitSet } from './bitSet';
import type { LcsBuilder } from './lcsBuilder';

export function binarySearchInts(array: Int32Array, element: number, fromIndex = 0, toIndex = array.length): number {
	let low = fromIndex;
	let high = toIndex - 1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		const middleElement = array[middle];
		if (middleElement < element) low = middle + 1;
		else if (middleElement > element) high = middle - 1;
		else return middle;
	}
	return -(low + 1);
}

export class Reindexer {
	private readonly oldIndices: Int32Array[] = [new Int32Array(0), new Int32Array(0)];
	private readonly originalLengths = [-1, -1];
	private readonly discardedLengths = [-1, -1];

	discardUnique(ints1: Int32Array, ints2: Int32Array): [Int32Array, Int32Array] {
		const discarded1 = this.discard(ints2, ints1, 0);
		return [discarded1, this.discard(discarded1, ints2, 1)];
	}

	private discard(needed: Int32Array, toDiscard: Int32Array, arrayIndex: number): Int32Array {
		this.originalLengths[arrayIndex] = toDiscard.length;
		const sorted = needed.slice().sort();
		const discarded: number[] = [];
		const oldIndices: number[] = [];
		for (let i = 0; i < toDiscard.length; i++) {
			const index = toDiscard[i];
			if (binarySearchInts(sorted, index) >= 0) {
				discarded.push(index);
				oldIndices.push(i);
			}
		}
		this.oldIndices[arrayIndex] = Int32Array.from(oldIndices);
		this.discardedLengths[arrayIndex] = discarded.length;
		return Int32Array.from(discarded);
	}

	reindex(discardedChanges: BitSet[], builder: LcsBuilder): void {
		const [original1, original2] = this.originalLengths;
		const [discarded1, discarded2] = this.discardedLengths;
		let changes1: BitSet;
		let changes2: BitSet;

		if (discarded1 === original1 && discarded2 === original2) {
			changes1 = discardedChanges[0];
			changes2 = discardedChanges[1];
		} else {
			changes1 = new BitSet(original1);
			changes2 = new BitSet(original2);
			let x = 0;
			let y = 0;
			while (x < discarded1 || y < discarded2) {
				if (x < discarded1 && y < discarded2 && !discardedChanges[0].get(x) && !discardedChanges[1].get(y)) {
					x = increment(this.oldIndices[0], x, changes1, original1);
					y = increment(this.oldIndices[1], y, changes2, original2);
				} else if (discardedChanges[0].get(x)) {
					changes1.set(this.oldIndices[0][x]);
					x = increment(this.oldIndices[0], x, changes1, original1);
				} else if (discardedChanges[1].get(y)) {
					changes2.set(this.oldIndices[1][y]);
					y = increment(this.oldIndices[1], y, changes2, original2);
				}
			}
			changes1.setRange(0, discarded1 === 0 ? original1 : this.oldIndices[0][0]);
			changes2.setRange(0, discarded2 === 0 ? original2 : this.oldIndices[1][0]);
		}

		let x = 0;
		let y = 0;
		while (x < original1 && y < original2) {
			const startX = x;
			while (x < original1 && y < original2 && !changes1.get(x) && !changes2.get(y)) {
				x++;
				y++;
			}
			if (x > startX) builder.addEqual(x - startX);
			let deleted = 0;
			let inserted = 0;
			while (x < original1 && changes1.get(x)) {
				deleted++;
				x++;
			}
			while (y < original2 && changes2.get(y)) {
				inserted++;
				y++;
			}
			if (deleted !== 0 || inserted !== 0) builder.addChange(deleted, inserted);
		}
		if (x !== original1 || y !== original2) builder.addChange(original1 - x, original2 - y);
	}
}

function increment(indexes: Int32Array, i: number, set: BitSet, length: number): number {
	if (i + 1 < indexes.length) set.setRange(indexes[i] + 1, indexes[i + 1]);
	else set.setRange(indexes[i] + 1, length);
	return i + 1;
}
