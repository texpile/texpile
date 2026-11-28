// sourceProse in a worker, for a file no editor holds the masked text of
import type { TexMask } from '../texMask';
import type { SpellLanguage } from '../languages/spellLanguages';
import type { SpellMarkup } from './sourceProse';

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, (prose: TexMask | null) => void>();

function workerNow(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL('./sourceProse.worker.ts', import.meta.url), { type: 'module' });
	w.onmessage = (event: MessageEvent<{ id: number; prose?: TexMask }>) => {
		waiting.get(event.data.id)?.(event.data.prose ?? null);
		waiting.delete(event.data.id);
	};
	w.onerror = () => {
		for (const answer of waiting.values()) answer(null);
		waiting.clear();
		w.terminate();
		worker = null;
	};
	return (worker = w);
}

const MOST_KEPT = 32;
const kept = new Map<string, Promise<TexMask | null>>();

/** null when the worker failed; the last few texts asked for are answered again without the worker */
export function sourceProseInWorker(text: string, markup: SpellMarkup, spelling: SpellLanguage | null): Promise<TexMask | null> {
	const key = `${markup}|${spelling}|${text}`;
	const found = kept.get(key);
	if (found) {
		kept.delete(key);
		kept.set(key, found);
		return found;
	}
	const asked = new Promise<TexMask | null>((answer) => {
		const id = nextId++;
		waiting.set(id, answer);
		workerNow().postMessage({ id, text, markup, spelling });
	});
	kept.set(key, asked);
	void asked.then((prose) => prose === null && kept.delete(key));
	if (kept.size > MOST_KEPT) kept.delete(kept.keys().next().value!);
	return asked;
}
