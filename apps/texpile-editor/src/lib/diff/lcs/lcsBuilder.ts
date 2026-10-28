// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/LCSBuilder.kt

export type LcsBuilder = {
	addEqual(length: number): void;
	addChange(first: number, second: number): void;
};
