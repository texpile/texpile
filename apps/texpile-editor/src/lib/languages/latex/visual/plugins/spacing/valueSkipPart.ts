// a command that inserts a vertical skip, as its value in the package data says (algorithm2e's \BlankLine: \vskip 1ex)
import { lengthLabel, texLength, verticalSpaceFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
const SKIP = /^\\vskip\s*(.+)$/s;

/** the length a command without arguments skips down, or null */
function skipOf(name: string): string | null {
	const value = commonFacts(name).value;
	return value ? (SKIP.exec(value.trim())?.[1] ?? null) : null;
}

export function insertsSkip(name: string): boolean {
	return skipOf(name) !== null;
}

export function valueSkipPart(name: string, source: string): ChipFace | null {
	const length = skipOf(name);
	return length === null ? null : verticalSpaceFace(`\\${name}`, texLength(length), lengthLabel(length), source);
}
