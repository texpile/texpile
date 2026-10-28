// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/MyersLCS.kt

import { BitSet } from './bitSet';
import { check } from './check';
import { DELTA_THRESHOLD_SIZE } from './diffConfig';
import { FilesTooBigForDiffError } from './filesTooBigForDiffError';

export class MyersLcs {
	private readonly vForward: Int32Array;
	private readonly vBackward: Int32Array;

	constructor(
		private readonly first: Int32Array,
		private readonly second: Int32Array,
		private readonly start1 = 0,
		private readonly count1 = first.length,
		private readonly start2 = 0,
		private readonly count2 = second.length,
		readonly changes1 = new BitSet(first.length),
		readonly changes2 = new BitSet(second.length)
	) {
		changes1.setRange(start1, start1 + count1);
		changes2.setRange(start2, start2 + count2);

		const totalSequenceLength = count1 + count2;
		this.vForward = new Int32Array(totalSequenceLength + 1);
		this.vBackward = new Int32Array(totalSequenceLength + 1);
	}

	get changes(): [BitSet, BitSet] {
		return [this.changes1, this.changes2];
	}

	/** Runs O(ND) Myers algorithm where D is bound by A + B * sqrt(N). */
	executeLinear(): void {
		const threshold = 20000 + 10 * Math.floor(Math.sqrt(this.count1 + this.count2));
		this.executeWith(threshold, false);
	}

	executeWithThreshold(): void {
		const threshold = Math.max(20000 + 10 * Math.floor(Math.sqrt(this.count1 + this.count2)), DELTA_THRESHOLD_SIZE);
		this.executeWith(threshold, true);
	}

	private executeWith(threshold: number, throwException: boolean): void {
		if (this.count1 === 0 || this.count2 === 0) return;
		this.executeRange(0, this.count1, 0, this.count2, Math.min(threshold, this.count1 + this.count2), throwException);
	}

	// LCS( old[oldStart, oldEnd), new[newStart, newEnd) )
	private executeRange(
		oldStart: number,
		oldEnd: number,
		newStart: number,
		newEnd: number,
		differenceEstimate: number,
		throwException: boolean
	): void {
		check(oldStart <= oldEnd && newStart <= newEnd);
		if (oldStart >= oldEnd || newStart >= newEnd) return;

		const vForward = this.vForward;
		const vBackward = this.vBackward;
		const oldLength = oldEnd - oldStart;
		const newLength = newEnd - newStart;
		vForward[newLength + 1] = 0;
		vBackward[newLength + 1] = 0;
		const halfD = (differenceEstimate + 1) >> 1;
		let xx = -1;
		let kk = -1;
		let td = -1;

		search: for (let d = 0; d <= halfD; d++) {
			const lowK = newLength + Math.max(-d, -newLength + ((d ^ newLength) & 1));
			const highK = newLength + Math.min(d, oldLength - ((d ^ oldLength) & 1));

			for (let k = lowK; k <= highK; k += 2) {
				let x = k === lowK || (k !== highK && vForward[k - 1] < vForward[k + 1]) ? vForward[k + 1] : vForward[k - 1] + 1;
				const y = x - k + newLength;
				x += this.commonSubsequenceLengthForward(oldStart + x, newStart + y, Math.min(oldEnd - oldStart - x, newEnd - newStart - y));
				vForward[k] = x;
			}

			if ((oldLength - newLength) % 2 !== 0) {
				for (let k = lowK; k <= highK; k += 2) {
					if (oldLength - (d - 1) <= k && k <= oldLength + (d - 1)) {
						if (vForward[k] + vBackward[newLength + oldLength - k] >= oldLength) {
							xx = vForward[k];
							kk = k;
							td = 2 * d - 1;
							break search;
						}
					}
				}
			}

			for (let k = lowK; k <= highK; k += 2) {
				let x = k === lowK || (k !== highK && vBackward[k - 1] < vBackward[k + 1]) ? vBackward[k + 1] : vBackward[k - 1] + 1;
				const y = x - k + newLength;
				x += this.commonSubsequenceLengthBackward(oldEnd - 1 - x, newEnd - 1 - y, Math.min(oldEnd - oldStart - x, newEnd - newStart - y));
				vBackward[k] = x;
			}

			if ((oldLength - newLength) % 2 === 0) {
				for (let k = lowK; k <= highK; k += 2) {
					if (oldLength - d <= k && k <= oldLength + d) {
						if (vForward[oldLength + newLength - k] + vBackward[k] >= oldLength) {
							xx = oldLength - vBackward[k];
							kk = oldLength + newLength - k;
							td = 2 * d;
							break search;
						}
					}
				}
			}
		}

		if (td > 1) {
			const yy = xx - kk + newLength;
			const oldDiff = (td + 1) >> 1;
			if (0 < xx && 0 < yy) this.executeRange(oldStart, oldStart + xx, newStart, newStart + yy, oldDiff, throwException);
			if (oldStart + xx < oldEnd && newStart + yy < newEnd) {
				this.executeRange(oldStart + xx, oldEnd, newStart + yy, newEnd, td - oldDiff, throwException);
			}
		} else if (td >= 0) {
			let x = oldStart;
			let y = newStart;
			while (x < oldEnd && y < newEnd) {
				const commonLength = this.commonSubsequenceLengthForward(x, y, Math.min(oldEnd - x, newEnd - y));
				if (commonLength > 0) {
					this.addUnchanged(x, y, commonLength);
					x += commonLength;
					y += commonLength;
				} else if (oldEnd - oldStart > newEnd - newStart) {
					++x;
				} else {
					++y;
				}
			}
		} else if (throwException) {
			throw new FilesTooBigForDiffError();
		}
	}

	private addUnchanged(start1: number, start2: number, count: number): void {
		this.changes1.setRange(this.start1 + start1, this.start1 + start1 + count, false);
		this.changes2.setRange(this.start2 + start2, this.start2 + start2 + count, false);
	}

	private commonSubsequenceLengthForward(oldIndex: number, newIndex: number, maxLength: number): number {
		let x = oldIndex;
		let y = newIndex;
		const limit = Math.min(maxLength, Math.min(this.count1 - oldIndex, this.count2 - newIndex));
		while (x - oldIndex < limit && this.first[this.start1 + x] === this.second[this.start2 + y]) {
			++x;
			++y;
		}
		return x - oldIndex;
	}

	private commonSubsequenceLengthBackward(oldIndex: number, newIndex: number, maxLength: number): number {
		let x = oldIndex;
		let y = newIndex;
		const limit = Math.min(maxLength, Math.min(oldIndex, newIndex) + 1);
		while (oldIndex - x < limit && this.first[this.start1 + x] === this.second[this.start2 + y]) {
			--x;
			--y;
		}
		return oldIndex - x;
	}
}
