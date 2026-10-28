// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ByWordRt.kt

import type { FairDiffIterable } from '../../iterables/diffIterable';
import { diffObjects } from '../../iterables/diffIterableUtil';
import { MergeWordFragment } from '../../ranges/mergeWordFragment';
import { buildSimple } from '../comparisonMergeUtil';
import { ComparisonPolicy } from '../comparisonPolicy';
import { charCount } from '../characterUtils';
import { isAlpha, isContinuousScript } from '../trimUtil';
import { AdjustmentPunctuationMatcher } from './adjustmentPunctuationMatcher';
import { WordChunkOptimizer } from './chunkOptimizer';
import { type InlineChunk, NewlineChunk, WordChunk } from './inlineChunk';
import { correctMergeDefault, correctMergeIgnoreSpaces } from './mergeSpacesCorrector';

export function compareWords3(text1: string, text2: string, text3: string, policy: ComparisonPolicy): MergeWordFragment[] {
	const words1 = getInlineChunks(text1);
	const words2 = getInlineChunks(text2);
	const words3 = getInlineChunks(text3);

	const iterable1 = compareWordsWithDelimiters(text2, text1, words2, words1);
	const iterable2 = compareWordsWithDelimiters(text2, text3, words2, words3);

	const wordConflicts = buildSimple(iterable1, iterable2);
	const result =
		policy === ComparisonPolicy.IGNORE_WHITESPACES
			? correctMergeIgnoreSpaces(wordConflicts, text1, text2, text3)
			: correctMergeDefault(wordConflicts, text1, text2, text3);

	return result.map((range) => new MergeWordFragment(range));
}

function compareWordsWithDelimiters(
	text1: string,
	text2: string,
	words1: readonly InlineChunk[],
	words2: readonly InlineChunk[]
): FairDiffIterable {
	const wordChanges = diffObjects(words1, words2);
	const optimized = new WordChunkOptimizer(words1, words2, text1, text2, wordChanges).build();
	return new AdjustmentPunctuationMatcher(text1, text2, words1, words2, optimized).build();
}

export function getInlineChunks(text: string): InlineChunk[] {
	const chunks: InlineChunk[] = [];

	const length = text.length;
	let offset = 0;

	let wordStart = -1;
	let wordHash = 0;

	while (offset < length) {
		const codePoint = text.codePointAt(offset) as number;
		const count = charCount(codePoint);

		const alpha = isAlpha(codePoint);
		const isWordPart = alpha && !isContinuousScript(codePoint);

		if (isWordPart) {
			if (wordStart === -1) {
				wordStart = offset;
				wordHash = 0;
			}
			wordHash = (Math.imul(wordHash, 31) + codePoint) | 0;
		} else {
			if (wordStart !== -1) {
				chunks.push(new WordChunk(text, wordStart, offset, wordHash));
				wordStart = -1;
			}

			if (alpha) {
				// continuous script
				chunks.push(new WordChunk(text, offset, offset + count, codePoint));
			} else if (codePoint === 10) {
				chunks.push(new NewlineChunk(offset));
			}
		}

		offset += count;
	}

	if (wordStart !== -1) {
		chunks.push(new WordChunk(text, wordStart, length, wordHash));
	}

	return chunks;
}
