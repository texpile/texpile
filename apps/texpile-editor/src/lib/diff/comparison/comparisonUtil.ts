// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/ComparisonUtil.kt

import { ComparisonPolicy } from './comparisonPolicy';

export function isEqualTexts(text1: string, text2: string, policy: ComparisonPolicy): boolean {
	if (policy === ComparisonPolicy.IGNORE_WHITESPACES) return equalsIgnoreWhitespaces(text1, text2);
	return text1 === text2;
}

function isWhiteSpaceCode(code: number): boolean {
	return code === 10 || code === 9 || code === 32;
}

function equalsIgnoreWhitespaces(text1: string, text2: string): boolean {
	const length1 = text1.length;
	const length2 = text2.length;

	let index1 = 0;
	let index2 = 0;
	while (index1 < length1 && index2 < length2) {
		if (text1.charCodeAt(index1) === text2.charCodeAt(index2)) {
			index1++;
			index2++;
			continue;
		}

		let skipped = false;
		while (index1 !== length1 && isWhiteSpaceCode(text1.charCodeAt(index1))) {
			skipped = true;
			index1++;
		}
		while (index2 !== length2 && isWhiteSpaceCode(text2.charCodeAt(index2))) {
			skipped = true;
			index2++;
		}

		if (!skipped) return false;
	}

	for (; index1 !== length1; index1++) {
		if (!isWhiteSpaceCode(text1.charCodeAt(index1))) return false;
	}
	for (; index2 !== length2; index2++) {
		if (!isWhiteSpaceCode(text2.charCodeAt(index2))) return false;
	}

	return true;
}
