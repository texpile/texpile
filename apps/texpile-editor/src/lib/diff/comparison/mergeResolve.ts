// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/MergeResolveUtil.kt

import { DiffTooBigError } from '../iterables/diffTooBigError';
import { MergeConflictKind } from '../ranges/mergeConflictType';
import { MergeRange } from '../ranges/mergeRange';
import { MergeWordFragment } from '../ranges/mergeWordFragment';
import { compareWordMergeContents, getWordMergeType } from '../ranges/mergeRangeUtil';
import { ThreeSide } from '../ranges/side';
import { ComparisonPolicy } from './comparisonPolicy';
import { compareWords3 } from './word/byWordRt';

export type MergeEdit = { from: number; to: number; insert: string };

// a stretch of the merged text and the range of the right text it replaces
type MergePiece = { from: number; to: number; text: string };

type SimpleResolution = { text: string; pieces: MergePiece[] };

export function tryResolveMerge(left: string, base: string, right: string): string | null {
	return resolveSimple(left, base, right)?.text ?? null;
}

// edits against right (editor memory, left is disk) that turn it into the tryResolveMerge result
export function resolveMergeOnto(left: string, base: string, right: string): MergeEdit[] | null {
	const resolution = resolveSimple(left, base, right);
	if (!resolution) return null;
	return piecesToEdits(resolution.pieces, right);
}

function resolveSimple(left: string, base: string, right: string): SimpleResolution | null {
	try {
		const resolved = new SimpleHelper(left, base, right).execute(ComparisonPolicy.DEFAULT);
		if (resolved) return resolved;

		return new SimpleHelper(left, base, right).execute(ComparisonPolicy.IGNORE_WHITESPACES);
	} catch (error) {
		if (error instanceof DiffTooBigError) return null;
		throw error;
	}
}

function piecesToEdits(pieces: readonly MergePiece[], right: string): MergeEdit[] {
	const edits: MergeEdit[] = [];
	for (const piece of pieces) {
		const current = right.slice(piece.from, piece.to);
		if (current === piece.text) continue;

		const prefix = commonPrefixLength(current, piece.text);
		const suffix = commonSuffixLength(current, piece.text, prefix);
		const edit: MergeEdit = {
			from: piece.from + prefix,
			to: piece.to - suffix,
			insert: piece.text.slice(prefix, piece.text.length - suffix)
		};

		const previous = edits[edits.length - 1];
		if (previous && previous.to === edit.from) {
			previous.to = edit.to;
			previous.insert += edit.insert;
		} else {
			edits.push(edit);
		}
	}
	return edits;
}

function isHighSurrogate(code: number): boolean {
	return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
	return code >= 0xdc00 && code <= 0xdfff;
}

function commonPrefixLength(text1: string, text2: string): number {
	const limit = Math.min(text1.length, text2.length);
	let length = 0;
	while (length < limit && text1.charCodeAt(length) === text2.charCodeAt(length)) length++;
	// a shared high surrogate may pair with different low surrogates
	if (length > 0 && isHighSurrogate(text1.charCodeAt(length - 1))) length--;
	return length;
}

function commonSuffixLength(text1: string, text2: string, prefix: number): number {
	const limit = Math.min(text1.length, text2.length) - prefix;
	let length = 0;
	while (length < limit && text1.charCodeAt(text1.length - 1 - length) === text2.charCodeAt(text2.length - 1 - length)) {
		length++;
	}
	// a shared low surrogate may pair with different high surrogates
	if (length > 0 && isLowSurrogate(text1.charCodeAt(text1.length - length))) length--;
	return length;
}

class SimpleHelper {
	private readonly newContent: string[] = [];
	private readonly pieces: MergePiece[] = [];

	private last1 = 0;
	private last2 = 0;
	private last3 = 0;

	private readonly texts: readonly [string, string, string];

	constructor(
		private readonly leftText: string,
		private readonly baseText: string,
		private readonly rightText: string
	) {
		this.texts = [leftText, baseText, rightText];
	}

	execute(policy: ComparisonPolicy): SimpleResolution | null {
		const changes = compareWords3(this.leftText, this.baseText, this.rightText, policy);

		for (const fragment of changes) {
			const baseRange = this.nextMergeRange(
				fragment.getStartOffset(ThreeSide.LEFT),
				fragment.getStartOffset(ThreeSide.BASE),
				fragment.getStartOffset(ThreeSide.RIGHT)
			);
			this.appendBase(baseRange);

			const conflictRange = this.nextMergeRange(
				fragment.getEndOffset(ThreeSide.LEFT),
				fragment.getEndOffset(ThreeSide.BASE),
				fragment.getEndOffset(ThreeSide.RIGHT)
			);
			if (!this.appendConflict(conflictRange, policy)) return null;
		}

		const trailingRange = this.nextMergeRange(this.leftText.length, this.baseText.length, this.rightText.length);
		this.appendBase(trailingRange);

		return { text: this.newContent.join(''), pieces: this.pieces };
	}

	private nextMergeRange(end1: number, end2: number, end3: number): MergeRange {
		const range = new MergeRange(this.last1, end1, this.last2, end2, this.last3, end3);
		this.last1 = end1;
		this.last2 = end2;
		this.last3 = end3;
		return range;
	}

	private appendBase(range: MergeRange): void {
		if (range.isEmpty) return;

		const policy = ComparisonPolicy.DEFAULT;

		if (this.isUnchangedRange(range, policy)) {
			this.append(range, ThreeSide.BASE);
			return;
		}

		const type = this.getConflictType(range, policy);
		if (type.isChange(ThreeSide.LEFT)) this.append(range, ThreeSide.LEFT);
		else if (type.isChange(ThreeSide.RIGHT)) this.append(range, ThreeSide.RIGHT);
		else this.append(range, ThreeSide.BASE);
	}

	private appendConflict(range: MergeRange, policy: ComparisonPolicy): boolean {
		const type = this.getConflictType(range, policy);
		if (type.kind === MergeConflictKind.CONFLICT) return false;

		if (type.isChange(ThreeSide.LEFT)) this.append(range, ThreeSide.LEFT);
		else this.append(range, ThreeSide.RIGHT);

		return true;
	}

	private append(range: MergeRange, side: ThreeSide): void {
		let text: string;
		if (side === ThreeSide.LEFT) text = this.leftText.slice(range.start1, range.end1);
		else if (side === ThreeSide.BASE) text = this.baseText.slice(range.start2, range.end2);
		else text = this.rightText.slice(range.start3, range.end3);

		this.newContent.push(text);
		this.pieces.push({ from: range.start3, to: range.end3, text });
	}

	private getConflictType(range: MergeRange, policy: ComparisonPolicy) {
		return getWordMergeType(new MergeWordFragment(range), this.texts, policy);
	}

	private isUnchangedRange(range: MergeRange, policy: ComparisonPolicy): boolean {
		const fragment = new MergeWordFragment(range);
		return (
			compareWordMergeContents(fragment, this.texts, policy, ThreeSide.BASE, ThreeSide.LEFT) &&
			compareWordMergeContents(fragment, this.texts, policy, ThreeSide.BASE, ThreeSide.RIGHT)
		);
	}
}
