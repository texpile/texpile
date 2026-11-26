// The title a suggestion takes from the kind of change the model made
import { m } from '$lib/paraglide/messages';

export type ChangeKind =
	| 'spelling'
	| 'addComma'
	| 'removeComma'
	| 'punctuation'
	| 'hyphen'
	| 'form'
	| 'case'
	| 'addWord'
	| 'removeWord'
	| 'word'
	| 'order'
	| 'rephrase';

const COMMA = /[,，、]/g;
const NOT_LETTER = /[^\p{L}\p{N}]+/gu;

// the default locale's dictionary also splits Chinese and Japanese, which write no spaces
const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });

function words(text: string): string[] {
	return [...WORDS.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment);
}

function commas(text: string): number {
	return text.match(COMMA)?.length ?? 0;
}

function letters(text: string): string {
	return text.replace(NOT_LETTER, '');
}

function sharedStart(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return i;
}

/** `whole` is a sentence rephrased as one change */
export function changeKind(quote: string, replacement: string, whole: boolean): ChangeKind {
	if (whole) return 'rephrase';
	if (letters(quote) === letters(replacement)) {
		if (replacement.includes('-') && !quote.includes('-')) return 'hyphen';
		const added = commas(replacement) - commas(quote);
		if (added > 0) return 'addComma';
		if (added < 0) return 'removeComma';
		return 'punctuation';
	}
	if (letters(quote).toLowerCase() === letters(replacement).toLowerCase()) return 'case';
	const was = words(quote);
	const now = words(replacement);
	if (now.length > was.length && was.every((w) => now.includes(w))) return 'addWord';
	if (now.length < was.length && now.every((w) => was.includes(w))) return 'removeWord';
	if (was.length > 1 && [...was].sort().join(' ') === [...now].sort().join(' ')) return 'order';
	if (was.length === 1 && now.length === 1) {
		const a = letters(was[0]).toLowerCase();
		const b = letters(now[0]).toLowerCase();
		const shared = sharedStart(a, b);
		if (shared >= 3 && shared >= Math.min(a.length, b.length) * 0.6) return 'form';
		return 'word';
	}
	return was.length + now.length > 4 ? 'rephrase' : 'word';
}

/** grammar or wording, the two rules a writer can turn off */
export function changeRule(kind: ChangeKind): 'grammar' | 'wording' {
	// the prompt asks for grammar fixes, so a swapped word is one; only a rephrased sentence is wording
	return kind === 'rephrase' ? 'wording' : 'grammar';
}

export function changeTitle(kind: ChangeKind): string {
	switch (kind) {
		case 'spelling':
			return m.proofread_change_spelling();
		case 'addComma':
			return m.proofread_change_add_comma();
		case 'removeComma':
			return m.proofread_change_remove_comma();
		case 'punctuation':
			return m.proofread_change_punctuation();
		case 'hyphen':
			return m.proofread_change_hyphen();
		case 'form':
			return m.proofread_change_form();
		case 'case':
			return m.proofread_change_case();
		case 'addWord':
			return m.proofread_change_add_word();
		case 'removeWord':
			return m.proofread_change_remove_word();
		case 'word':
			return m.proofread_change_word();
		case 'order':
			return m.proofread_change_order();
		case 'rephrase':
			return m.proofread_change_rephrase();
	}
}
