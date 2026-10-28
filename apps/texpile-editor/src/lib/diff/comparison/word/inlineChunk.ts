// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ByWordRt.kt

import type { Hashable } from '../../ranges/enumerator';

export class WordChunk implements Hashable {
	constructor(
		private readonly text: string,
		readonly offset1: number,
		readonly offset2: number,
		private readonly hash: number
	) {}

	private get content(): string {
		return this.text.slice(this.offset1, this.offset2);
	}

	equals(other: unknown): boolean {
		if (this === other) return true;
		if (!(other instanceof WordChunk)) return false;
		if (this.hash !== other.hash) return false;
		return this.content === other.content;
	}

	hashCode(): number {
		return this.hash;
	}
}

export class NewlineChunk implements Hashable {
	constructor(readonly offset1: number) {}

	get offset2(): number {
		return this.offset1 + 1;
	}

	equals(other: unknown): boolean {
		return other instanceof NewlineChunk;
	}

	hashCode(): number {
		return 1;
	}
}

export type InlineChunk = WordChunk | NewlineChunk;
