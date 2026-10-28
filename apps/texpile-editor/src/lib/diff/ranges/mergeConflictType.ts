// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/util/MergeConflictType.kt

import { ThreeSide } from './side';

export enum MergeConflictKind {
	INSERTED,
	DELETED,
	MODIFIED,
	CONFLICT
}

export class MergeConflictType {
	constructor(
		readonly kind: MergeConflictKind,
		private readonly leftChange: boolean,
		private readonly rightChange: boolean
	) {}

	isChange(side: ThreeSide): boolean {
		if (side === ThreeSide.LEFT) return this.leftChange;
		if (side === ThreeSide.RIGHT) return this.rightChange;
		return true;
	}
}
