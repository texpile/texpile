// Copyright 2000-2024 JetBrains s.r.o. and contributors. Use of this source code is governed by the Apache 2.0 license.
// Translated to TypeScript from IntelliJ Community platform/util/diff/src/com/intellij/diff/comparison/CharacterUtils.kt

const ALPHABETIC = /^\p{Alphabetic}$/u;
const IDEOGRAPHIC = /^\p{Ideographic}$/u;
const HIRAGANA = /^\p{Script=Hiragana}$/u;
const KATAKANA = /^\p{Script=Katakana}$/u;
const THAI = /^\p{Script=Thai}$/u;
const JAVANESE = /^\p{Script=Javanese}$/u;
const DECIMAL_DIGIT = /^\p{Nd}$/u;

export function charCount(codePoint: number): number {
	return codePoint >= 0x10000 ? 2 : 1;
}

function matchesCodePoint(pattern: RegExp, codePoint: number): boolean {
	return pattern.test(String.fromCodePoint(codePoint));
}

export function isAlphabetic(codePoint: number): boolean {
	return matchesCodePoint(ALPHABETIC, codePoint);
}

export function isIdeographic(codePoint: number): boolean {
	return matchesCodePoint(IDEOGRAPHIC, codePoint);
}

export function isBmpCodePoint(codePoint: number): boolean {
	return codePoint >>> 16 === 0;
}

export function isHiraganaScript(codePoint: number): boolean {
	return matchesCodePoint(HIRAGANA, codePoint);
}

export function isKatakanaScript(codePoint: number): boolean {
	return matchesCodePoint(KATAKANA, codePoint);
}

export function isThaiScript(codePoint: number): boolean {
	return matchesCodePoint(THAI, codePoint);
}

export function isJavaneseScript(codePoint: number): boolean {
	return matchesCodePoint(JAVANESE, codePoint);
}

export function isDecimalDigit(codePoint: number): boolean {
	return matchesCodePoint(DECIMAL_DIGIT, codePoint);
}
