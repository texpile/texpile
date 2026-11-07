import { lengthLabel, texLength, verticalSpaceFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
const SKIP = /^\\vskip\s*(.+)$/s;

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
