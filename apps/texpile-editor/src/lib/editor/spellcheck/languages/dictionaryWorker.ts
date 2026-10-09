// checks prose against the built CSpell dictionaries, each fetched on first use; the two used last stay loaded
import { createSpellingDictionaryFromTrieFile, type SpellingDictionary } from 'cspell-dictionary';
import { misspelledWords, type WordSpan } from './misspelledWords';
import type { DictionaryLanguage, DictionaryOptions } from './spellLanguages';

export type DictionaryRequest =
	| { id: number; op: 'check'; language: DictionaryLanguage; text: string }
	| { id: number; op: 'suggest'; language: DictionaryLanguage; word: string }
	| { op: 'words'; language: DictionaryLanguage; words: string[] }
	| { op: 'base'; href: string };

export type DictionaryReply = { id: number; spans?: WordSpan[]; suggestions?: string[]; error?: string };

type LoadedDictionary = { dictionary: SpellingDictionary; ignoreCase: boolean };

const KEPT = 2;
const SUGGESTIONS = 6;
const loaded = new Map<DictionaryLanguage, Promise<LoadedDictionary>>();
const ownWords = new Map<DictionaryLanguage, Set<string>>();
let base = '';

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`${url}: ${response.status}`);
	const bytes = new Uint8Array(await response.arrayBuffer());
	// a server that sent it with Content-Encoding: gzip has unpacked it already
	if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
	const unpacked = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
	return new Uint8Array(await new Response(unpacked).arrayBuffer());
}

async function loadDictionary(language: DictionaryLanguage): Promise<LoadedDictionary> {
	const [trie, options] = await Promise.all([
		fetchBytes(`${base}${language}.trie.gz`),
		fetch(`${base}${language}.json`).then((r) => r.json() as Promise<DictionaryOptions>)
	]);
	const { repMap, dictionaryInformation } = options;
	return {
		dictionary: createSpellingDictionaryFromTrieFile(trie, language, `${language}.trie`, { repMap, dictionaryInformation }),
		ignoreCase: !options.caseSensitive
	};
}

function dictionaryFor(language: DictionaryLanguage): Promise<LoadedDictionary> {
	let entry = loaded.get(language);
	// to the back of the line, as the one used last
	if (entry) loaded.delete(language);
	else {
		entry = loadDictionary(language);
		// a failed fetch is tried again on the next request
		entry.catch(() => loaded.get(language) === entry && loaded.delete(language));
	}
	loaded.set(language, entry);
	while (loaded.size > KEPT) loaded.delete(loaded.keys().next().value!);
	return entry;
}

async function check(language: DictionaryLanguage, text: string): Promise<WordSpan[]> {
	const { dictionary, ignoreCase } = await dictionaryFor(language);
	const own = ownWords.get(language);
	return misspelledWords(text, language, (word) => !!own?.has(word.toLowerCase()) || dictionary.has(word, { ignoreCase }));
}

/** in the word's own capitalization, so Hauss offers Haus and not haus first */
async function suggest(language: DictionaryLanguage, word: string): Promise<string[]> {
	const { dictionary, ignoreCase } = await dictionaryFor(language);
	const capital = /^\p{Lu}/u.test(word);
	const found = dictionary
		.suggest(word, { numSuggestions: SUGGESTIONS * 2, ignoreCase })
		.map((s) => (capital ? s.word[0].toLocaleUpperCase(language) + s.word.slice(1) : s.word));
	// a compound offered as two capitalized parts, HausTür, is not a spelling
	return [...new Set(found)].filter((s) => s !== word && !/\p{Ll}\p{Lu}/u.test(s)).slice(0, SUGGESTIONS);
}

self.onmessage = async (event: MessageEvent<DictionaryRequest>) => {
	const request = event.data;
	if (request.op === 'base') base = request.href;
	else if (request.op === 'words') ownWords.set(request.language, new Set(request.words.map((w) => w.toLowerCase())));
	else {
		let reply: DictionaryReply;
		try {
			reply =
				request.op === 'check'
					? { id: request.id, spans: await check(request.language, request.text) }
					: { id: request.id, suggestions: await suggest(request.language, request.word) };
		} catch (error) {
			reply = { id: request.id, error: String(error) };
		}
		self.postMessage(reply);
	}
};
