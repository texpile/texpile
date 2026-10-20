import { m } from '$lib/paraglide/messages';

function fmt(n: number): string {
	return n.toLocaleString();
}

export function wordsText(n: number): string {
	return n === 1 ? m.wordcount_words_one() : m.wordcount_words({ words: fmt(n) });
}

export function charactersText(n: number): string {
	return n === 1 ? m.wordcount_characters_one() : m.wordcount_characters({ characters: fmt(n) });
}

export function inPaperText(n: number): string {
	return n === 1 ? m.wordcount_in_paper_one() : m.wordcount_in_paper({ characters: fmt(n) });
}

export function selectedText(selection: number, total: number): string {
	return total === 1
		? m.wordcount_selected_one({ selection: fmt(selection) })
		: m.wordcount_selected({ selection: fmt(selection), total: fmt(total) });
}
