// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/util/diff/Diff.kt

import { Enumerator, type Hashable } from '../ranges/enumerator';
import { FilesTooBigForDiffError } from './filesTooBigForDiffError';
import type { LcsBuilder } from './lcsBuilder';
import { MyersLcs } from './myersLcs';
import { PatienceIntLcs } from './patienceIntLcs';
import { Reindexer } from './reindexer';

export class Change {
	constructor(
		readonly line0: number,
		readonly line1: number,
		readonly deleted: number,
		readonly inserted: number,
		public link: Change | null
	) {}
}

export class ChangeBuilder implements LcsBuilder {
	private index1 = 0;
	private index2 = 0;
	firstChange: Change | null = null;
	private lastChange: Change | null = null;

	constructor(startShift: number) {
		this.skip(startShift, startShift);
	}

	addChange(first: number, second: number): void {
		const change = new Change(this.index1, this.index2, first, second, null);
		if (this.lastChange) this.lastChange.link = change;
		else this.firstChange = change;
		this.lastChange = change;
		this.skip(first, second);
	}

	addEqual(length: number): void {
		this.skip(length, length);
	}

	private skip(first: number, second: number): void {
		this.index1 += first;
		this.index2 += second;
	}
}

export function buildChangesForObjects<T extends Hashable>(objects1: readonly T[], objects2: readonly T[]): Change | null {
	const startShift = getStartShift(objects1.length, objects2.length, (i) => objects1[i].equals(objects2[i]));
	const endCut = getEndCut(objects1.length, objects2.length, startShift, (i) =>
		objects1[objects1.length - i - 1].equals(objects2[objects2.length - i - 1])
	);

	const fast = buildChangesFast(objects1.length, objects2.length, startShift, endCut);
	if (fast) return fast.value;

	const enumerator = new Enumerator<T>();
	const ints1 = enumerator.enumerate(objects1, startShift, endCut);
	const ints2 = enumerator.enumerate(objects2, startShift, endCut);
	return buildChangesFromInts(ints1, ints2, new ChangeBuilder(startShift));
}

export function buildChangesForInts(array1: Int32Array, array2: Int32Array): Change | null {
	const startShift = getStartShift(array1.length, array2.length, (i) => array1[i] === array2[i]);
	const endCut = getEndCut(
		array1.length,
		array2.length,
		startShift,
		(i) => array1[array1.length - i - 1] === array2[array2.length - i - 1]
	);

	const fast = buildChangesFast(array1.length, array2.length, startShift, endCut);
	if (fast) return fast.value;

	const copyArray = startShift !== 0 || endCut !== 0;
	const ints1 = copyArray ? array1.slice(startShift, array1.length - endCut) : array1;
	const ints2 = copyArray ? array2.slice(startShift, array2.length - endCut) : array2;
	return buildChangesFromInts(ints1, ints2, new ChangeBuilder(startShift));
}

function buildChangesFast(length1: number, length2: number, startShift: number, endCut: number): { value: Change | null } | null {
	const trimmedLength1 = length1 - startShift - endCut;
	const trimmedLength2 = length2 - startShift - endCut;
	if (trimmedLength1 !== 0 && trimmedLength2 !== 0) return null;
	const change =
		trimmedLength1 !== 0 || trimmedLength2 !== 0 ? new Change(startShift, startShift, trimmedLength1, trimmedLength2, null) : null;
	return { value: change };
}

function buildChangesFromInts(ints1: Int32Array, ints2: Int32Array, builder: ChangeBuilder): Change | null {
	const reindexer = new Reindexer();
	const discarded = reindexer.discardUnique(ints1, ints2);

	if (discarded[0].length === 0 && discarded[1].length === 0) {
		builder.addChange(ints1.length, ints2.length);
		return builder.firstChange;
	}

	let changes;
	try {
		const myers = new MyersLcs(discarded[0], discarded[1]);
		myers.executeWithThreshold();
		changes = myers.changes;
	} catch (error) {
		if (!(error instanceof FilesTooBigForDiffError)) throw error;
		const patience = new PatienceIntLcs(discarded[0], discarded[1]);
		patience.execute(true);
		changes = patience.changes;
	}

	reindexer.reindex(changes, builder);
	return builder.firstChange;
}

function getStartShift(length1: number, length2: number, isEqualAt: (index: number) => boolean): number {
	const size = Math.min(length1, length2);
	let index = 0;
	for (let i = 0; i < size; i++) {
		if (!isEqualAt(i)) break;
		++index;
	}
	return index;
}

function getEndCut(length1: number, length2: number, startShift: number, isEqualFromEnd: (index: number) => boolean): number {
	const size = Math.min(length1, length2) - startShift;
	let index = 0;
	for (let i = 0; i < size; i++) {
		if (!isEqualFromEnd(i)) break;
		++index;
	}
	return index;
}
