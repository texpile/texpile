// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/TrimUtil.kt

import { MergeRange } from '../ranges/mergeRange';
import {
	isAlphabetic,
	isBmpCodePoint,
	isDecimalDigit,
	isHiraganaScript,
	isIdeographic,
	isJavaneseScript,
	isKatakanaScript,
	isThaiScript
} from './characterUtils';
import { ComparisonPolicy } from './comparisonPolicy';
import { isEqualTexts } from './comparisonUtil';

export function isSpaceEnterOrTab(charCode: number): boolean {
	return charCode === 10 || charCode === 9 || charCode === 32;
}

export function isPunctuation(code: number): boolean {
	if (code === 95) return false; // exclude '_'
	return (
		(code >= 33 && code <= 47) || // !"#$%&'()*+,-./
		(code >= 58 && code <= 64) || // :;<=>?@
		(code >= 91 && code <= 96) || // [\]^_`
		(code >= 123 && code <= 126) // {|}~
	);
}

export function isWhiteSpaceCodePoint(codePoint: number): boolean {
	return codePoint < 128 && isSpaceEnterOrTab(codePoint);
}

export function isAlpha(codePoint: number): boolean {
	if (isWhiteSpaceCodePoint(codePoint)) return false;
	return !isPunctuation(codePoint);
}

export function isContinuousScript(codePoint: number): boolean {
	if (codePoint < 128) return false;
	if (isDecimalDigit(codePoint)) return false;

	if (!isBmpCodePoint(codePoint)) return true;

	if (isIdeographic(codePoint)) return true;
	if (!isAlphabetic(codePoint)) return true;

	return isHiraganaScript(codePoint) || isKatakanaScript(codePoint) || isThaiScript(codePoint) || isJavaneseScript(codePoint);
}

export function expandForward(
	start1: number,
	start2: number,
	end1: number,
	end2: number,
	equals: (index1: number, index2: number) => boolean
): number {
	let index1 = start1;
	let index2 = start2;
	while (index1 < end1 && index2 < end2) {
		if (!equals(index1, index2)) break;
		index1++;
		index2++;
	}
	return index1 - start1;
}

export function expandBackward(
	start1: number,
	start2: number,
	end1: number,
	end2: number,
	equals: (index1: number, index2: number) => boolean
): number {
	let index1 = end1;
	let index2 = end2;
	while (start1 < index1 && start2 < index2) {
		if (!equals(index1 - 1, index2 - 1)) break;
		index1--;
		index2--;
	}
	return end1 - index1;
}

function trimStart(start: number, end: number, ignored: (index: number) => boolean): number {
	let index = start;
	while (index < end) {
		if (!ignored(index)) break;
		index++;
	}
	return index;
}

function trimEnd(start: number, end: number, ignored: (index: number) => boolean): number {
	let index = end;
	while (start < index) {
		if (!ignored(index - 1)) break;
		index--;
	}
	return index;
}

export function trimMergeRange(text1: string, text2: string, text3: string, range: MergeRange): MergeRange {
	const start1 = trimStart(range.start1, range.end1, (index) => isSpaceEnterOrTab(text1.charCodeAt(index)));
	const end1 = trimEnd(start1, range.end1, (index) => isSpaceEnterOrTab(text1.charCodeAt(index)));
	const start2 = trimStart(range.start2, range.end2, (index) => isSpaceEnterOrTab(text2.charCodeAt(index)));
	const end2 = trimEnd(start2, range.end2, (index) => isSpaceEnterOrTab(text2.charCodeAt(index)));
	const start3 = trimStart(range.start3, range.end3, (index) => isSpaceEnterOrTab(text3.charCodeAt(index)));
	const end3 = trimEnd(start3, range.end3, (index) => isSpaceEnterOrTab(text3.charCodeAt(index)));
	return new MergeRange(start1, end1, start2, end2, start3, end3);
}

export function expandWhitespacesForward(
	text1: string,
	text2: string,
	text3: string,
	start1: number,
	start2: number,
	start3: number,
	end1: number,
	end2: number,
	end3: number
): number {
	let index1 = start1;
	let index2 = start2;
	let index3 = start3;
	while (index1 < end1 && index2 < end2 && index3 < end3) {
		const code = text1.charCodeAt(index1);
		if (code !== text2.charCodeAt(index2)) break;
		if (code !== text3.charCodeAt(index3)) break;
		if (!isSpaceEnterOrTab(code)) break;
		index1++;
		index2++;
		index3++;
	}
	return index1 - start1;
}

export function expandWhitespacesBackward(
	text1: string,
	text2: string,
	text3: string,
	start1: number,
	start2: number,
	start3: number,
	end1: number,
	end2: number,
	end3: number
): number {
	let index1 = end1;
	let index2 = end2;
	let index3 = end3;
	while (start1 < index1 && start2 < index2 && start3 < index3) {
		const code = text1.charCodeAt(index1 - 1);
		if (code !== text2.charCodeAt(index2 - 1)) break;
		if (code !== text3.charCodeAt(index3 - 1)) break;
		if (!isSpaceEnterOrTab(code)) break;
		index1--;
		index2--;
		index3--;
	}
	return end1 - index1;
}

export function expandMergeWhitespaces(text1: string, text2: string, text3: string, range: MergeRange): MergeRange {
	const forward = expandWhitespacesForward(
		text1,
		text2,
		text3,
		range.start1,
		range.start2,
		range.start3,
		range.end1,
		range.end2,
		range.end3
	);
	const start1 = range.start1 + forward;
	const start2 = range.start2 + forward;
	const start3 = range.start3 + forward;

	const backward = expandWhitespacesBackward(text1, text2, text3, start1, start2, start3, range.end1, range.end2, range.end3);
	return new MergeRange(start1, range.end1 - backward, start2, range.end2 - backward, start3, range.end3 - backward);
}

export function isMergeEqualsIgnoreWhitespaces(text1: string, text2: string, text3: string, range: MergeRange): boolean {
	const sequence1 = text1.slice(range.start1, range.end1);
	const sequence2 = text2.slice(range.start2, range.end2);
	const sequence3 = text3.slice(range.start3, range.end3);
	return (
		isEqualTexts(sequence2, sequence1, ComparisonPolicy.IGNORE_WHITESPACES) &&
		isEqualTexts(sequence2, sequence3, ComparisonPolicy.IGNORE_WHITESPACES)
	);
}
