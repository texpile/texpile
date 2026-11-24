// white-space, tabs and text-transform; raw chips and code blocks are islands with their own layout (14.2)
import type { LayoutStyle } from '../../contracts/styleTypes';

export type WhiteSpaceMode = LayoutStyle['whiteSpace'];

// CSS's initial tab-size: no editor sheet sets one
const TAB_SIZE = 8;
// CSS capitalize raises the first letter of each word; a word starts after anything but a letter or a digit
const WORD_START = /(^|[^\p{L}\p{N}])(\p{L})/gu;

export function wrapsLines(mode: WhiteSpaceMode): boolean {
	return mode !== 'nowrap' && mode !== 'pre';
}

export function collapsesSpaces(mode: WhiteSpaceMode): boolean {
	return mode === 'normal' || mode === 'nowrap' || mode === 'pre-line';
}

/** source text as CSS would draw it in a face (FaceText), where runs of spaces may collapse; offsets do not matter there */
export function collapseFaceText(text: string, mode: WhiteSpaceMode): string {
	if (!collapsesSpaces(mode)) return text;
	const spaced = mode === 'pre-line' ? text.replace(/[ \t]+/g, ' ') : text.replace(/[ \t\n\r\f]+/g, ' ');
	return spaced;
}

/** the case the text is drawn in; null when it is drawn as written */
export function transformedText(text: string, transform: LayoutStyle['textTransform']): string | null {
	switch (transform) {
		case 'uppercase':
			return text.toUpperCase();
		case 'lowercase':
			return text.toLowerCase();
		case 'capitalize':
			return text.replace(WORD_START, (_, before: string, letter: string) => before + letter.toUpperCase());
		default:
			return null;
	}
}

/** the advance of a tab at x, to the next stop of tab-size spaces of the block's font */
export function tabAdvanceAt(x: number, spaceWidth: number, tabSize = TAB_SIZE): number {
	const stop = spaceWidth * tabSize;
	if (stop <= 0) return 0;
	const next = (Math.floor(x / stop + 1e-6) + 1) * stop;
	// a tab narrower than half a space jumps a whole stop, as Chromium's does
	return next - x < spaceWidth / 2 ? next - x + stop : next - x;
}
