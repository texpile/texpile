// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ChunkOptimizer.kt

import { createUnchanged, fair } from '../../iterables/diffIterableUtil';
import type { FairDiffIterable } from '../../iterables/diffIterable';
import { Range } from '../../ranges/range';
import { type Side, selectBySide, sideFromLeft } from '../../ranges/side';
import { isSpaceEnterOrTab, expandBackward, expandForward } from '../trimUtil';
import { type InlineChunk, NewlineChunk } from './inlineChunk';

/*
 * 1. Minimise amount of chunks
 *      good: "AX[AB]" - "[AB]"
 *      bad: "[A]XA[B]" - "[A][B]"
 *
 * 2. Minimise amount of modified 'sentences', where sentence is a sequence of words, that are not separated by whitespace
 *      good: "[AX] [AZ]" - "[AX] AY [AZ]"
 *      bad: "[AX A][Z]" - "[AX A]Y A[Z]"
 *      ex: "1.0.123 1.0.155" vs "1.0.123 1.0.134 1.0.155"
 */
export class WordChunkOptimizer {
	private readonly ranges: Range[] = [];

	constructor(
		private readonly words1: readonly InlineChunk[],
		private readonly words2: readonly InlineChunk[],
		private readonly text1: string,
		private readonly text2: string,
		private readonly iterable: FairDiffIterable
	) {}

	build(): FairDiffIterable {
		for (const range of this.iterable.unchanged()) {
			this.ranges.push(range);
			this.processLastRanges();
		}

		return fair(createUnchanged(this.ranges, this.words1.length, this.words2.length));
	}

	private processLastRanges(): void {
		if (this.ranges.length < 2) return;

		const range1 = this.ranges[this.ranges.length - 2];
		const range2 = this.ranges[this.ranges.length - 1];
		if (range1.end1 !== range2.start1 && range1.end2 !== range2.start2) return;

		const count1 = range1.end1 - range1.start1;
		const count2 = range2.end1 - range2.start1;

		const equals = (index1: number, index2: number): boolean => this.words1[index1].equals(this.words2[index2]);
		const equalForward = expandForward(range1.end1, range1.end2, range1.end1 + count2, range1.end2 + count2, equals);
		const equalBackward = expandBackward(range2.start1 - count1, range2.start2 - count1, range2.start1, range2.start2, equals);

		if (equalForward === 0 && equalBackward === 0) return;

		// merge chunks left [A]B[B] -> [AB]B
		if (equalForward === count2) {
			this.ranges.pop();
			this.ranges.pop();
			this.ranges.push(new Range(range1.start1, range1.end1 + count2, range1.start2, range1.end2 + count2));
			this.processLastRanges();
			return;
		}

		// merge chunks right [A]A[B] -> A[AB]
		if (equalBackward === count1) {
			this.ranges.pop();
			this.ranges.pop();
			this.ranges.push(new Range(range2.start1 - count1, range2.end1, range2.start2 - count1, range2.end2));
			this.processLastRanges();
			return;
		}

		const touchSide = sideFromLeft(range1.end1 === range2.start1);

		const shift = this.getShift(touchSide, equalForward, equalBackward, range2);
		if (shift !== 0) {
			this.ranges.pop();
			this.ranges.pop();
			this.ranges.push(new Range(range1.start1, range1.end1 + shift, range1.start2, range1.end2 + shift));
			this.ranges.push(new Range(range2.start1 + shift, range2.end1, range2.start2 + shift, range2.end2));
		}
	}

	// 0 - do nothing, >0 - shift forward, <0 - shift backward
	private getShift(touchSide: Side, equalForward: number, equalBackward: number, range2: Range): number {
		const touchWords = selectBySide(touchSide, this.words1, this.words2);
		const touchText = selectBySide(touchSide, this.text1, this.text2);
		const touchStart = selectBySide(touchSide, range2.start1, range2.start2);

		// check if chunks are already separated by whitespaces
		if (isSeparatedWithWhitespace(touchText, touchWords[touchStart - 1], touchWords[touchStart])) return 0;

		// shift chunks left [X]A Y[A ZA] -> [XA] YA [ZA]
		//                   [X][A ZA] -> [XA] [ZA]
		const leftShift = findSequenceEdgeShift(touchText, touchWords, touchStart, equalForward, true);
		if (leftShift > 0) return leftShift;

		// shift chunks right [AX A]Y A[Z] -> [AX] AY [AZ]
		//                    [AX A][Z] -> [AX] [AZ]
		const rightShift = findSequenceEdgeShift(touchText, touchWords, touchStart - 1, equalBackward, false);
		if (rightShift > 0) return -rightShift;

		return 0;
	}
}

function findSequenceEdgeShift(text: string, words: readonly InlineChunk[], offset: number, count: number, leftToRight: boolean): number {
	for (let i = 0; i < count; i++) {
		const word1 = leftToRight ? words[offset + i] : words[offset - i - 1];
		const word2 = leftToRight ? words[offset + i + 1] : words[offset - i];
		if (isSeparatedWithWhitespace(text, word1, word2)) return i + 1;
	}
	return -1;
}

function isSeparatedWithWhitespace(text: string, word1: InlineChunk, word2: InlineChunk): boolean {
	if (word1 instanceof NewlineChunk || word2 instanceof NewlineChunk) return true;

	for (let i = word1.offset2; i < word2.offset1; i++) {
		if (isSpaceEnterOrTab(text.charCodeAt(i))) return true;
	}
	return false;
}
