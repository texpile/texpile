// the words added to each dictionary language's list; English's list is Harper's (linter.ts)
import { userData, updateUserData } from '$lib/storage/userData';
import { observe } from '$lib/runes/observe.svelte';
import { BASE_WORDS, addWordToDocumentDictionary, markLintsStale } from '../linter';
import { setDictionaryWords } from './dictionaryClient';
import { DICTIONARY_LANGUAGES, isDictionaryLanguage, type DictionaryLanguage, type SpellLanguage } from './spellLanguages';

export function languageWords(language: DictionaryLanguage): string[] {
	return userData.current.languageWords[language] ?? [];
}

/** returns the words that were not in the list yet */
export function addLanguageWords(language: DictionaryLanguage, words: readonly string[]): string[] {
	const list = languageWords(language);
	const fresh = [...new Set(words.map((w) => w.trim().toLowerCase()).filter((w) => w && !list.includes(w)))];
	if (fresh.length) updateUserData({ languageWords: { ...userData.current.languageWords, [language]: [...list, ...fresh] } });
	return fresh;
}

export function removeLanguageWord(language: DictionaryLanguage, word: string): void {
	const list = languageWords(language);
	const gone = word.trim().toLowerCase();
	if (list.includes(gone))
		updateUserData({ languageWords: { ...userData.current.languageWords, [language]: list.filter((w) => w !== gone) } });
}

let sent = '';

// user data is rewritten whole on every write, completion counts included, so compare what the worker would get
observe(
	() => userData.current.languageWords,
	(lists) => {
		const next = JSON.stringify(lists);
		if (next === sent) return;
		const first = !sent;
		sent = next;
		for (const language of DICTIONARY_LANGUAGES) setDictionaryWords(language, [...BASE_WORDS, ...(lists[language] ?? [])]);
		if (!first) markLintsStale();
	}
);

/** English's list is Harper's */
export async function addToDictionary(word: string, language: SpellLanguage | undefined): Promise<void> {
	if (isDictionaryLanguage(language)) addLanguageWords(language, [word]);
	else await addWordToDocumentDictionary(word);
}
