// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/fragments/MergeWordFragmentImpl.kt

import type { MergeRange } from './mergeRange';
import { selectByThreeSide, type ThreeSide } from './side';

export class MergeWordFragment {
	constructor(private readonly range: MergeRange) {}

	getStartOffset(side: ThreeSide): number {
		return selectByThreeSide(side, this.range.start1, this.range.start2, this.range.start3);
	}

	getEndOffset(side: ThreeSide): number {
		return selectByThreeSide(side, this.range.end1, this.range.end2, this.range.end3);
	}
}
