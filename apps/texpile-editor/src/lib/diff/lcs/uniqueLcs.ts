// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/UniqueLCS.kt

import { binarySearchInts } from './reindexer';

export class UniqueLcs {
	constructor(
		private readonly first: Int32Array,
		private readonly second: Int32Array,
		private readonly start1 = 0,
		private readonly count1 = first.length,
		private readonly start2 = 0,
		private readonly count2 = second.length
	) {}

	execute(): [Int32Array, Int32Array] | null {
		// map: key -> (offset1 + 1), -1 for a repeated key
		// match: offset1 -> (offset2 + 1)
		const map = new Map<number, number>();
		const match = new Int32Array(this.count1);

		for (let i = 0; i < this.count1; i++) {
			const key = this.first[this.start1 + i];
			const value = map.get(key) ?? 0;
			if (value === -1) continue;
			if (value === 0) map.set(key, i + 1);
			else map.set(key, -1);
		}

		let count = 0;
		for (let i = 0; i < this.count2; i++) {
			const key = this.second[this.start2 + i];
			const value = map.get(key) ?? 0;
			if (value === 0 || value === -1) continue;
			if (match[value - 1] === 0) {
				match[value - 1] = i + 1;
				count++;
			} else {
				match[value - 1] = 0;
				map.set(key, -1);
				count--;
			}
		}

		if (count === 0) return null;

		const sequence = new Int32Array(count);
		const lastElement = new Int32Array(count);
		const predecessor = new Int32Array(this.count1);

		let length = 0;
		for (let i = 0; i < this.count1; i++) {
			if (match[i] === 0) continue;

			const j = findInsertionIndex(sequence, match[i], length);
			if (j === length || match[i] < sequence[j]) {
				sequence[j] = match[i];
				lastElement[j] = i;
				predecessor[i] = j > 0 ? lastElement[j - 1] : -1;
				if (j === length) length++;
			}
		}

		const result: [Int32Array, Int32Array] = [new Int32Array(length), new Int32Array(length)];

		let i = length - 1;
		let current = lastElement[length - 1];
		while (current !== -1) {
			result[0][i] = current;
			result[1][i] = match[current] - 1;
			i--;
			current = predecessor[current];
		}

		return result;
	}
}

function findInsertionIndex(sequence: Int32Array, value: number, length: number): number {
	const index = binarySearchInts(sequence, value, 0, length);
	if (index >= 0) throw new Error('check failed');
	return -index - 1;
}
