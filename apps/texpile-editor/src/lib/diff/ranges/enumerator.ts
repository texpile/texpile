// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/util/Enumerator.kt

export type Hashable = {
	equals(other: unknown): boolean;
	hashCode(): number;
};

export class Enumerator<T extends Hashable> {
	private readonly buckets = new Map<number, [T, number][]>();
	private nextNumber = 1;

	enumerate(objects: readonly T[], startShift = 0, endCut = 0): Int32Array {
		const result = new Int32Array(objects.length - startShift - endCut);
		for (let i = 0; i < result.length; i++) {
			result[i] = this.enumerateObject(objects[startShift + i]);
		}
		return result;
	}

	private enumerateObject(object: T): number {
		const hash = object.hashCode();
		let bucket = this.buckets.get(hash);
		if (!bucket) {
			bucket = [];
			this.buckets.set(hash, bucket);
		}
		for (const [candidate, number] of bucket) {
			if (candidate.equals(object)) return number;
		}
		const number = this.nextNumber++;
		bucket.push([object, number]);
		return number;
	}
}
