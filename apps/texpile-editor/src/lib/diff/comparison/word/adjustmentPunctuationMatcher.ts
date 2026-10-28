// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ByWordRt.kt

import type { FairDiffIterable } from '../../iterables/diffIterable';
import { ChangeBuilder, createUnchanged, fair } from '../../iterables/diffIterableUtil';
import { check } from '../../lcs/check';
import { Range } from '../../ranges/range';
import { comparePunctuation } from './byCharRt';
import type { InlineChunk } from './inlineChunk';

/*
 * sample: "[ X { A ! B } Y ]" "( X ... Y )" will lead to comparison of 3 groups of separators
 *      "["  vs "(",
 *      "{" + "}" vs "..."
 *      "]"  vs ")"
 */
export class AdjustmentPunctuationMatcher {
	private readonly length1: number;
	private readonly length2: number;
	private readonly builder: ChangeBuilder;

	private lastStart1 = -1;
	private lastStart2 = -1;
	private lastEnd1 = -1;
	private lastEnd2 = -1;

	constructor(
		private readonly text1: string,
		private readonly text2: string,
		private readonly words1: readonly InlineChunk[],
		private readonly words2: readonly InlineChunk[],
		private readonly changes: FairDiffIterable
	) {
		this.length1 = text1.length;
		this.length2 = text2.length;
		this.builder = new ChangeBuilder(this.length1, this.length2);
	}

	build(): FairDiffIterable {
		this.execute();
		return fair(this.builder.finish());
	}

	private execute(): void {
		this.clearLastRange();

		this.matchForwardAt(-1, -1);

		for (const range of this.changes.unchanged()) {
			const count = range.end1 - range.start1;
			for (let i = 0; i < count; i++) {
				const index1 = range.start1 + i;
				const index2 = range.start2 + i;

				const start1 = this.words1[index1].offset1;
				const start2 = this.words2[index2].offset1;
				const end1 = this.words1[index1].offset2;
				const end2 = this.words2[index2].offset2;

				this.matchBackwardAt(index1, index2);

				this.builder.markEqual(start1, start2, end1, end2);

				this.matchForwardAt(index1, index2);
			}
		}

		this.matchBackwardAt(this.words1.length, this.words2.length);
	}

	private clearLastRange(): void {
		this.lastStart1 = -1;
		this.lastStart2 = -1;
		this.lastEnd1 = -1;
		this.lastEnd2 = -1;
	}

	private matchBackwardAt(index1: number, index2: number): void {
		const start1 = index1 === 0 ? 0 : this.words1[index1 - 1].offset2;
		const start2 = index2 === 0 ? 0 : this.words2[index2 - 1].offset2;
		const end1 = index1 === this.words1.length ? this.length1 : this.words1[index1].offset1;
		const end2 = index2 === this.words2.length ? this.length2 : this.words2[index2].offset1;

		this.matchBackward(start1, start2, end1, end2);
		this.clearLastRange();
	}

	private matchForwardAt(index1: number, index2: number): void {
		const start1 = index1 === -1 ? 0 : this.words1[index1].offset2;
		const start2 = index2 === -1 ? 0 : this.words2[index2].offset2;
		const end1 = index1 + 1 === this.words1.length ? this.length1 : this.words1[index1 + 1].offset1;
		const end2 = index2 + 1 === this.words2.length ? this.length2 : this.words2[index2 + 1].offset1;

		check(this.lastStart1 === -1 && this.lastStart2 === -1 && this.lastEnd1 === -1 && this.lastEnd2 === -1);

		this.lastStart1 = start1;
		this.lastStart2 = start2;
		this.lastEnd1 = end1;
		this.lastEnd2 = end2;
	}

	private matchBackward(start1: number, start2: number, end1: number, end2: number): void {
		check(this.lastStart1 !== -1 && this.lastStart2 !== -1 && this.lastEnd1 !== -1 && this.lastEnd2 !== -1);

		if (this.lastStart1 === start1 && this.lastStart2 === start2) {
			// pair of adjustment matched words, match gap between ("A B" - "A B")
			check(this.lastEnd1 === end1 && this.lastEnd2 === end2);

			this.matchRange(start1, start2, end1, end2);
			return;
		}
		if (this.lastStart1 < start1 && this.lastStart2 < start2) {
			// pair of matched words, with few unmatched ones between ("A X B" - "A Y B")
			check(this.lastEnd1 <= start1 && this.lastEnd2 <= start2);

			this.matchRange(this.lastStart1, this.lastStart2, this.lastEnd1, this.lastEnd2);
			this.matchRange(start1, start2, end1, end2);
			return;
		}

		// one side adjustment, and other has non-matched words between ("A B" - "A Y B")
		this.matchComplexRange(start1, start2, end1, end2);
	}

	private matchRange(start1: number, start2: number, end1: number, end2: number): void {
		if (start1 === end1 && start2 === end2) return;

		const sequence1 = this.text1.slice(start1, end1);
		const sequence2 = this.text2.slice(start2, end2);

		const changes = comparePunctuation(sequence1, sequence2);

		for (const range of changes.unchanged()) {
			this.builder.markEqual(start1 + range.start1, start2 + range.start2, start1 + range.end1, start2 + range.end2);
		}
	}

	private matchComplexRange(start21: number, start22: number, end21: number, end22: number): void {
		const start11 = this.lastStart1;
		const start12 = this.lastStart2;
		const end11 = this.lastEnd1;
		const end12 = this.lastEnd2;

		if (start11 === start21 && end11 === end21) {
			this.matchComplexRangeLeft(start11, end11, start12, end12, start22, end22);
		} else if (start12 === start22 && end12 === end22) {
			this.matchComplexRangeRight(start12, end12, start11, end11, start21, end21);
		} else {
			throw new Error('unexpected punctuation ranges');
		}
	}

	private matchComplexRangeLeft(start1: number, end1: number, start12: number, end12: number, start22: number, end22: number): void {
		const sequence1 = this.text1.slice(start1, end1);
		const sequence21 = this.text2.slice(start12, end12);
		const sequence22 = this.text2.slice(start22, end22);

		const changes = comparePunctuation2Side(sequence1, sequence21, sequence22);

		for (const range of changes[0].unchanged()) {
			this.builder.markEqual(start1 + range.start1, start12 + range.start2, start1 + range.end1, start12 + range.end2);
		}
		for (const range of changes[1].unchanged()) {
			this.builder.markEqual(start1 + range.start1, start22 + range.start2, start1 + range.end1, start22 + range.end2);
		}
	}

	private matchComplexRangeRight(start2: number, end2: number, start11: number, end11: number, start21: number, end21: number): void {
		const sequence11 = this.text1.slice(start11, end11);
		const sequence12 = this.text1.slice(start21, end21);
		const sequence2 = this.text2.slice(start2, end2);

		const changes = comparePunctuation2Side(sequence2, sequence11, sequence12);

		// Mirrored ch.*1 and ch.*2 as "comparePunctuation2Side" works with 2 right sides, while we have 2 left here
		for (const range of changes[0].unchanged()) {
			this.builder.markEqual(start11 + range.start2, start2 + range.start1, start11 + range.end2, start2 + range.end1);
		}
		for (const range of changes[1].unchanged()) {
			this.builder.markEqual(start21 + range.start2, start2 + range.start1, start21 + range.end2, start2 + range.end1);
		}
	}
}

/*
 * Compare one char sequence with two others (as if they were a single sequence)
 *
 * Return two DiffIterable: (0, len1) - (0, len21) and (0, len1) - (0, len22)
 */
function comparePunctuation2Side(text1: string, text21: string, text22: string): [FairDiffIterable, FairDiffIterable] {
	const changes = comparePunctuation(text1, text21 + text22);

	const [ranges1, ranges2] = splitIterable2Side(changes, text21.length);

	return [fair(createUnchanged(ranges1, text1.length, text21.length)), fair(createUnchanged(ranges2, text1.length, text22.length))];
}

function splitIterable2Side(changes: FairDiffIterable, offset: number): [Range[], Range[]] {
	const ranges1: Range[] = [];
	const ranges2: Range[] = [];
	for (const range of changes.unchanged()) {
		if (range.end2 <= offset) {
			ranges1.push(new Range(range.start1, range.end1, range.start2, range.end2));
		} else if (range.start2 >= offset) {
			ranges2.push(new Range(range.start1, range.end1, range.start2 - offset, range.end2 - offset));
		} else {
			const length2 = offset - range.start2;
			ranges1.push(new Range(range.start1, range.start1 + length2, range.start2, offset));
			ranges2.push(new Range(range.start1 + length2, range.end1, 0, range.end2 - offset));
		}
	}
	return [ranges1, ranges2];
}
