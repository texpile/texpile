// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/util/MergeRange.kt

export class MergeRange {
	constructor(
		readonly start1: number,
		readonly end1: number,
		readonly start2: number,
		readonly end2: number,
		readonly start3: number,
		readonly end3: number
	) {}

	get isEmpty(): boolean {
		return this.start1 === this.end1 && this.start2 === this.end2 && this.start3 === this.end3;
	}

	toString(): string {
		return `[${this.start1}, ${this.end1}) - [${this.start2}, ${this.end2}) - [${this.start3}, ${this.end3})`;
	}
}
