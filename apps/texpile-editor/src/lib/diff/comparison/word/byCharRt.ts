// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ByCharRt.kt

import type { FairDiffIterable } from '../../iterables/diffIterable';
import { ChangeBuilder, diffInts, fair } from '../../iterables/diffIterableUtil';
import { isPunctuation } from '../trimUtil';

// compares punctuation characters only, all other characters stay unmatched
export function comparePunctuation(text1: string, text2: string): FairDiffIterable {
	const chars1 = getPunctuationChars(text1);
	const chars2 = getPunctuationChars(text2);

	const changes = diffInts(chars1.codePoints, chars2.codePoints);

	const builder = new ChangeBuilder(text1.length, text2.length);
	for (const range of changes.unchanged()) {
		const count = range.end1 - range.start1;
		for (let i = 0; i < count; i++) {
			builder.markEqual(chars1.offsets[range.start1 + i], chars2.offsets[range.start2 + i]);
		}
	}

	return fair(builder.finish());
}

type CodePointsOffsets = { codePoints: Int32Array; offsets: Int32Array };

function getPunctuationChars(text: string): CodePointsOffsets {
	const codePoints: number[] = [];
	const offsets: number[] = [];

	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (isPunctuation(code)) {
			codePoints.push(code);
			offsets.push(i);
		}
	}

	return { codePoints: Int32Array.from(codePoints), offsets: Int32Array.from(offsets) };
}
