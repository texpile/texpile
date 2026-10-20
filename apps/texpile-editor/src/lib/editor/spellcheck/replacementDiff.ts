import { diffChars } from 'diff';

export type ReplacementPart = { added?: boolean; removed?: boolean; value: string };

// short words read better as a whole-word replacement than a char diff
export function replacementDiffParts(original: string, replacement: string): ReplacementPart[] {
	if (Math.max(original.length, replacement.length) <= 6) {
		return [
			{ removed: true, value: original },
			{ added: true, value: replacement }
		];
	}
	return diffChars(original, replacement);
}
