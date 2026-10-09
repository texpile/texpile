// the dictionary worker, started on first use; each request is answered by id
import type { DictionaryReply, DictionaryRequest } from './dictionaryWorker';
import type { WordSpan } from './misspelledWords';
import { DICTIONARY_DIR, type DictionaryLanguage } from './spellLanguages';

type Asked = DictionaryRequest & { id: number };

let worker: Worker | null = null;
let lastId = 0;
const waiting = new Map<number, (reply: DictionaryReply) => void>();
const wordLists = new Map<DictionaryLanguage, string[]>();

function startedWorker(): Worker {
	if (worker) return worker;
	const started = new Worker(new URL('./dictionaryWorker.ts', import.meta.url), { type: 'module' });
	started.onmessage = (event: MessageEvent<DictionaryReply>) => {
		waiting.get(event.data.id)?.(event.data);
		waiting.delete(event.data.id);
	};
	// a worker that died answers what it owed with an error, and the next request starts another
	started.onerror = () => {
		for (const [id, answer] of waiting) answer({ id, error: 'the dictionary worker stopped' });
		waiting.clear();
		started.terminate();
		if (worker === started) worker = null;
	};
	started.postMessage({ op: 'base', href: new URL(`${DICTIONARY_DIR}/`, document.baseURI).href } satisfies DictionaryRequest);
	for (const [language, words] of wordLists) started.postMessage({ op: 'words', language, words } satisfies DictionaryRequest);
	return (worker = started);
}

function ask(request: Asked): Promise<DictionaryReply> {
	return new Promise((answer) => {
		waiting.set(request.id, answer);
		startedWorker().postMessage(request);
	});
}

/** null when the dictionary could not be loaded, so a caller does not keep the empty result as "no mistakes" */
export async function findMisspellings(language: DictionaryLanguage, text: string): Promise<WordSpan[] | null> {
	const reply = await ask({ id: ++lastId, op: 'check', language, text });
	if (reply.error) console.error(`[spelling] ${language}:`, reply.error);
	return reply.error ? null : (reply.spans ?? []);
}

export async function suggestSpellings(language: DictionaryLanguage, word: string): Promise<string[]> {
	const reply = await ask({ id: ++lastId, op: 'suggest', language, word });
	return reply.suggestions ?? [];
}

/** the words the dictionary takes besides its own */
export function setDictionaryWords(language: DictionaryLanguage, words: string[]): void {
	wordLists.set(language, words);
	worker?.postMessage({ op: 'words', language, words } satisfies DictionaryRequest);
}
