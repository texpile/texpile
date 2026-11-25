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

/** null when the worker failed */
export function sourceProseInWorker(text: string, markup: SpellMarkup, spelling: SpellLanguage | null): Promise<TexMask | null> {
	return new Promise((answer) => {
		const id = nextId++;
		waiting.set(id, answer);
		workerNow().postMessage({ id, text, markup, spelling });
	});
}
