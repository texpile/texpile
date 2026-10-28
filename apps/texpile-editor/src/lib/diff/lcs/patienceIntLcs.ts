// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/PatienceIntLCS.kt

import { BitSet } from './bitSet';
import { check } from './check';
import { FilesTooBigForDiffError } from './filesTooBigForDiffError';
import { MyersLcs } from './myersLcs';
import { UniqueLcs } from './uniqueLcs';

export class PatienceIntLcs {
	constructor(
		private readonly first: Int32Array,
		private readonly second: Int32Array,
		private readonly start1 = 0,
		private readonly count1 = first.length,
		private readonly start2 = 0,
		private readonly count2 = second.length,
		readonly changes1 = new BitSet(first.length),
		readonly changes2 = new BitSet(second.length)
	) {}

	get changes(): [BitSet, BitSet] {
		return [this.changes1, this.changes2];
	}

	execute(failOnSmallReduction = false): void {
		const thresholdCheckCounter = failOnSmallReduction ? 2 : -1;
		this.executeRange(this.start1, this.count1, this.start2, this.count2, thresholdCheckCounter);
	}

	private executeRange(
		rangeStart1: number,
		rangeCount1: number,
		rangeStart2: number,
		rangeCount2: number,
		initialThresholdCheckCounter: number
	): void {
		let start1 = rangeStart1;
		let count1 = rangeCount1;
		let start2 = rangeStart2;
		let count2 = rangeCount2;
		let thresholdCheckCounter = initialThresholdCheckCounter;
		if (count1 === 0 && count2 === 0) return;

		if (count1 === 0 || count2 === 0) {
			this.addChange(start1, count1, start2, count2);
			return;
		}

		const startOffset = this.matchForward(start1, count1, start2, count2);
		start1 += startOffset;
		start2 += startOffset;
		count1 -= startOffset;
		count2 -= startOffset;

		const endOffset = this.matchBackward(start1, count1, start2, count2);
		count1 -= endOffset;
		count2 -= endOffset;

		if (count1 === 0 || count2 === 0) {
			this.addChange(start1, count1, start2, count2);
			return;
		}

		if (thresholdCheckCounter === 0) this.checkReduction(count1, count2);
		thresholdCheckCounter = Math.max(-1, thresholdCheckCounter - 1);

		const matching = new UniqueLcs(this.first, this.second, start1, count1, start2, count2).execute();

		if (matching === null) {
			if (thresholdCheckCounter >= 0) this.checkReduction(count1, count2);
			new MyersLcs(this.first, this.second, start1, count1, start2, count2, this.changes1, this.changes2).executeLinear();
			return;
		}

		const matched = matching[0].length;
		check(matched > 0);

		let c1 = matching[0][0];
		let c2 = matching[1][0];

		this.executeRange(start1, c1, start2, c2, thresholdCheckCounter);

		for (let i = 1; i < matching[0].length; i++) {
			const s1 = matching[0][i - 1] + 1;
			const s2 = matching[1][i - 1] + 1;

			c1 = matching[0][i] - s1;
			c2 = matching[1][i] - s2;

			if (c1 > 0 || c2 > 0) this.executeRange(start1 + s1, c1, start2 + s2, c2, thresholdCheckCounter);
		}

		let s1: number;
		let s2: number;
		if (matching[0][matched - 1] === count1 - 1) {
			s1 = count1 - 1;
			c1 = 0;
		} else {
			s1 = matching[0][matched - 1] + 1;
			c1 = count1 - s1;
		}
		if (matching[1][matched - 1] === count2 - 1) {
			s2 = count2 - 1;
			c2 = 0;
		} else {
			s2 = matching[1][matched - 1] + 1;
			c2 = count2 - s2;
		}

		this.executeRange(start1 + s1, c1, start2 + s2, c2, thresholdCheckCounter);
	}

	private matchForward(start1: number, count1: number, start2: number, count2: number): number {
		const size = Math.min(count1, count2);
		let index = 0;
		for (let i = 0; i < size; i++) {
			if (this.first[start1 + i] !== this.second[start2 + i]) break;
			++index;
		}
		return index;
	}

	private matchBackward(start1: number, count1: number, start2: number, count2: number): number {
		const size = Math.min(count1, count2);
		let index = 0;
		for (let i = 1; i <= size; i++) {
			if (this.first[start1 + count1 - i] !== this.second[start2 + count2 - i]) break;
			++index;
		}
		return index;
	}

	private addChange(start1: number, count1: number, start2: number, count2: number): void {
		this.changes1.setRange(start1, start1 + count1);
		this.changes2.setRange(start2, start2 + count2);
	}

	private checkReduction(count1: number, count2: number): void {
		if (count1 * 2 < this.count1) return;
		if (count2 * 2 < this.count2) return;
		throw new FilesTooBigForDiffError();
	}
}
