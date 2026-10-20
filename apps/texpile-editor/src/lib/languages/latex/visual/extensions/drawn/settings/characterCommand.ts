// an accented letter (\'e, \v c, \"{\i}) or a symbol (\ss, \AA) as the character it prints, and the one character the
// file could hold instead, where there is one
import { ACCENTS, SYMBOLS, accentBase, accented } from '$lib/languages/latex/knowledge/commands/texCharacters';

export type TexCharacter = { name: string; accent: boolean; printed: string; direct: string | null };

const HEAD = /^\s*\\([a-zA-Z]+|[^a-zA-Z\s])/;

function single(text: string): string | null {
	return [...text].length === 1 ? text : null;
}

export function readCharacter(source: string): TexCharacter | null {
	const head = HEAD.exec(source);
	if (!head) return null;
	const name = head[1];
	const rest = source.slice(head[0].length);
	if (name in SYMBOLS && /^(?:\{\})?\s*$/.test(rest)) return { name, accent: false, printed: SYMBOLS[name], direct: single(SYMBOLS[name]) };
	if (!(name in ACCENTS)) return null;
	// a letter accent's name (\v) ends at a space or a brace, as TeX reads it; a symbol accent (\') takes the letter as it comes
	const argument =
		/^\s*\{([^{}]*)\}\s*$/.exec(rest)?.[1] ??
		(/^[a-zA-Z]/.test(name) ? /^\s+(\\[ij]|\p{L})\s*$/u : /^\s*(\\[ij]|\p{L})\s*$/u).exec(rest)?.[1];
	const base = argument === undefined ? null : accentBase(argument);
	if (!base) return null;
	// TeX puts an accent on a dotless i or j; typed, the accent goes on the letter itself
	const typed = accented(name, base === 'ı' ? 'i' : base === 'ȷ' ? 'j' : base);
	return { name, accent: true, printed: accented(name, base), direct: single(typed) };
}
