// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ByWordRt.kt

import { MergeRange } from '../../ranges/mergeRange';
import {
	expandMergeWhitespaces,
	expandWhitespacesBackward,
	expandWhitespacesForward,
	isMergeEqualsIgnoreWhitespaces,
	trimMergeRange
} from '../trimUtil';

export function correctMergeDefault(iterable: readonly MergeRange[], text1: string, text2: string, text3: string): MergeRange[] {
	const changes: MergeRange[] = [];
	for (const range of iterable) {
		const endCut = expandWhitespacesBackward(
			text1,
			text2,
			text3,
			range.start1,
			range.start2,
			range.start3,
			range.end1,
			range.end2,
			range.end3
		);
		const startCut = expandWhitespacesForward(
			text1,
			text2,
			text3,
			range.start1,
			range.start2,
			range.start3,
			range.end1 - endCut,
			range.end2 - endCut,
			range.end3 - endCut
		);

		const expand = new MergeRange(
			range.start1 + startCut,
			range.end1 - endCut,
			range.start2 + startCut,
			range.end2 - endCut,
			range.start3 + startCut,
			range.end3 - endCut
		);

		if (!expand.isEmpty) changes.push(expand);
	}
	return changes;
}

export function correctMergeIgnoreSpaces(iterable: readonly MergeRange[], text1: string, text2: string, text3: string): MergeRange[] {
	const changes: MergeRange[] = [];
	for (const range of iterable) {
		const expanded = expandMergeWhitespaces(text1, text2, text3, range);
		const trimmed = trimMergeRange(text1, text2, text3, expanded);

		if (!trimmed.isEmpty && !isMergeEqualsIgnoreWhitespaces(text1, text2, text3, trimmed)) {
			changes.push(trimmed);
		}
	}
	return changes;
}
