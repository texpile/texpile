export interface DocumentCount {
	words: number;
	characters: number;
	charactersWithSpaces: number;
	// null when the selection is collapsed
	selectionWords: number | null;
	selectionCharacters: number | null;
	selectionCharactersWithSpaces: number | null;
}

export const documentCountStore = $state<DocumentCount>({
	words: 0,
	characters: 0,
	charactersWithSpaces: 0,
	selectionWords: null,
	selectionCharacters: null,
	selectionCharactersWithSpaces: null
});

// exactly the JS /\s/ class (ASCII whitespace, NBSP, Zs separators, LS/PS, BOM)
function isSpace(c: number): boolean {
	if (c === 32 || (c >= 9 && c <= 13)) return true;
	if (c < 160) return false;
	return (
		c === 160 ||
		c === 0x1680 ||
		(c >= 0x2000 && c <= 0x200a) ||
		c === 0x2028 ||
		c === 0x2029 ||
		c === 0x202f ||
		c === 0x205f ||
		c === 0x3000 ||
		c === 0xfeff
	);
}

// one charCode pass: words = runs of non-whitespace, characters = non-whitespace count. The old
// trim/split/filter built an array of every word (~150k strings at 1MB) plus a stripped copy.
function countText(text: string): { words: number; characters: number } {
	let words = 0;
	let characters = 0;
	let inWord = false;
	for (let i = 0; i < text.length; i++) {
		if (isSpace(text.charCodeAt(i))) inWord = false;
		else {
			characters++;
			if (!inWord) words++;
			inWord = true;
		}
	}
	return { words, characters };
}

// Feed the store from raw editor text (source mode). Unlike the visual editor's plugin, which
// counts rendered prose, this counts the buffer verbatim -- LaTeX markup included -- because
// that is what the source view shows. Selection null/empty clears the selection counts.
export function setSourceDocCount(text: string): void {
	const { words, characters } = countText(text);
	documentCountStore.words = words;
	documentCountStore.charactersWithSpaces = text.length;
	documentCountStore.characters = characters;
}

export function setSourceSelectionCount(selText: string | null): void {
	if (selText && selText.length) {
		const { words, characters } = countText(selText);
		documentCountStore.selectionWords = words;
		documentCountStore.selectionCharactersWithSpaces = selText.length;
		documentCountStore.selectionCharacters = characters;
	} else {
		documentCountStore.selectionWords = null;
		documentCountStore.selectionCharacters = null;
		documentCountStore.selectionCharactersWithSpaces = null;
	}
}
