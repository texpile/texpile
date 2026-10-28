// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/BitSet.kt

const WORD_BITS = 32;
const ALL_BITS = 0xffffffff;

export class BitSet {
	private words: Uint32Array;
	private bitCount: number;

	constructor(size = WORD_BITS) {
		this.bitCount = size;
		this.words = new Uint32Array(Math.ceil(size / WORD_BITS));
	}

	get(index: number): boolean {
		if (index < 0) throw new RangeError(`index ${index} is negative`);
		if (index >= this.bitCount) return false;
		return (this.words[index >>> 5] & (1 << (index & 31))) !== 0;
	}

	set(index: number, value = true): void {
		this.setRange(index, index + 1, value);
	}

	setRange(from: number, to: number, value = true): void {
		if (from < 0 || to < 0) throw new RangeError(`range [${from}, ${to}) is negative`);
		if (from >= to) return;
		this.ensureCapacity(to - 1);
		const first = from >>> 5;
		const last = (to - 1) >>> 5;
		const firstMask = (ALL_BITS << (from & 31)) >>> 0;
		const lastMask = ALL_BITS >>> (31 - ((to - 1) & 31));
		if (first === last) {
			this.applyMask(first, (firstMask & lastMask) >>> 0, value);
			return;
		}
		this.applyMask(first, firstMask, value);
		this.words.fill(value ? ALL_BITS : 0, first + 1, last);
		this.applyMask(last, lastMask, value);
	}

	private applyMask(wordIndex: number, mask: number, value: boolean): void {
		if (value) this.words[wordIndex] |= mask;
		else this.words[wordIndex] &= ~mask;
	}

	private ensureCapacity(index: number): void {
		if (index < this.bitCount) return;
		this.bitCount = index + 1;
		const needed = Math.ceil(this.bitCount / WORD_BITS);
		if (needed > this.words.length) {
			const grown = new Uint32Array(needed);
			grown.set(this.words);
			this.words = grown;
		}
	}
}
