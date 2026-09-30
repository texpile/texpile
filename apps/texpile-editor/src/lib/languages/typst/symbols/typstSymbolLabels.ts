import type { TypstSymbol } from './typstSymbol.types';

// U+25CC, the dotted circle fonts draw a combining mark on when it has no letter of its own
const MARK_BASE = '\u25cc';

/** what a tile shows for a character with no ink: its modifiers, `thin` for `space.thin`, or its bare name */
export function invisibleSymbolLabel(symbol: TypstSymbol): string {
	const parts = symbol.path.split('.');
	return parts.length > 1 ? parts.slice(1).join('.') : symbol.path;
}

/** what a screen reader says for a tile: the name first, since the character alone is often read as nothing */
export function typstSymbolSpokenLabel(symbol: TypstSymbol): string {
	return [symbol.name, symbol.unicodeName, symbol.mathShorthand].filter(Boolean).join(', ');
}

/** what a tile draws: the character, a combining mark (`dot.triple`) on the dotted circle it would sit on */
export function typstSymbolGlyphText(symbol: TypstSymbol): string {
	return /^\p{M}/u.test(symbol.value) ? MARK_BASE + symbol.value : symbol.value;
}
