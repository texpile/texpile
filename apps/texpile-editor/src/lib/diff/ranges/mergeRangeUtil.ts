// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/util/MergeRangeUtil.kt

import type { ComparisonPolicy } from '../comparison/comparisonPolicy';
import { isEqualTexts } from '../comparison/comparisonUtil';
import { check } from '../lcs/check';
import { MergeConflictKind, MergeConflictType } from './mergeConflictType';
import type { MergeWordFragment } from './mergeWordFragment';
import { selectByThreeSide, ThreeSide } from './side';

type WordTexts = readonly [string, string, string];

function getMergeType(
	emptiness: (side: ThreeSide) => boolean,
	equality: (side1: ThreeSide, side2: ThreeSide) => boolean
): MergeConflictType {
	const isLeftEmpty = emptiness(ThreeSide.LEFT);
	const isBaseEmpty = emptiness(ThreeSide.BASE);
	const isRightEmpty = emptiness(ThreeSide.RIGHT);
	check(!isLeftEmpty || !isBaseEmpty || !isRightEmpty);

	if (isBaseEmpty) {
		if (isLeftEmpty) return new MergeConflictType(MergeConflictKind.INSERTED, false, true);
		if (isRightEmpty) return new MergeConflictType(MergeConflictKind.INSERTED, true, false);
		if (equality(ThreeSide.LEFT, ThreeSide.RIGHT)) return new MergeConflictType(MergeConflictKind.INSERTED, true, true);
		return new MergeConflictType(MergeConflictKind.CONFLICT, true, true);
	}

	if (isLeftEmpty && isRightEmpty) return new MergeConflictType(MergeConflictKind.DELETED, true, true);

	const unchangedLeft = equality(ThreeSide.BASE, ThreeSide.LEFT);
	const unchangedRight = equality(ThreeSide.BASE, ThreeSide.RIGHT);

	// upstream needs a stricter equality here, which the word path never supplies
	if (unchangedLeft && unchangedRight) throw new Error('both sides unchanged');

	if (unchangedLeft) {
		return new MergeConflictType(isRightEmpty ? MergeConflictKind.DELETED : MergeConflictKind.MODIFIED, false, true);
	}
	if (unchangedRight) {
		return new MergeConflictType(isLeftEmpty ? MergeConflictKind.DELETED : MergeConflictKind.MODIFIED, true, false);
	}

	if (equality(ThreeSide.LEFT, ThreeSide.RIGHT)) return new MergeConflictType(MergeConflictKind.MODIFIED, true, true);
	return new MergeConflictType(MergeConflictKind.CONFLICT, true, true);
}

export function getWordMergeType(fragment: MergeWordFragment, texts: WordTexts, policy: ComparisonPolicy): MergeConflictType {
	return getMergeType(
		(side) => fragment.getStartOffset(side) === fragment.getEndOffset(side),
		(side1, side2) => compareWordMergeContents(fragment, texts, policy, side1, side2)
	);
}

export function compareWordMergeContents(
	fragment: MergeWordFragment,
	texts: WordTexts,
	policy: ComparisonPolicy,
	side1: ThreeSide,
	side2: ThreeSide
): boolean {
	const text1 = selectByThreeSide(side1, ...texts);
	const text2 = selectByThreeSide(side2, ...texts);

	const content1 = text1.slice(fragment.getStartOffset(side1), fragment.getEndOffset(side1));
	const content2 = text2.slice(fragment.getStartOffset(side2), fragment.getEndOffset(side2));
	return isEqualTexts(content1, content2, policy);
}
