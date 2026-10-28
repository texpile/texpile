// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/util/Range.kt

export class Range {
	constructor(
		readonly start1: number,
		readonly end1: number,
		readonly start2: number,
		readonly end2: number
	) {
		if (start1 > end1 || start2 > end2) throw new Error(`[${start1}, ${end1}, ${start2}, ${end2}]`);
	}

	get isEmpty(): boolean {
		return this.start1 === this.end1 && this.start2 === this.end2;
	}

	toString(): string {
		return `[${this.start1}, ${this.end1}) - [${this.start2}, ${this.end2})`;
	}
}
