// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/FilesTooBigForDiffException.kt

export class FilesTooBigForDiffError extends Error {
	constructor() {
		super('The file is too big for diff');
		this.name = 'FilesTooBigForDiffError';
	}
}
