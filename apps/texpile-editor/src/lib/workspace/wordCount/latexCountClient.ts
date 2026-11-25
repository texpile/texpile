// the newest text waits while one is counted: a keystroke's count supersedes the one before it
import type { ProseCount } from './proseWords';

type Waiting = { text: string; answer: (count: ProseCount | null) => void };

let worker: Worker | null = null;
let busy: { id: number; answer: Waiting['answer'] } | null = null;
let waiting: Waiting | null = null;
let nextId = 1;

function send(job: Waiting): void {
	worker ??= new Worker(new URL('./latexCount.worker.ts', import.meta.url), { type: 'module' });
	worker.onmessage = (event: MessageEvent<{ id: number; count?: ProseCount }>) => {
		if (busy?.id !== event.data.id) return;
		busy.answer(event.data.count ?? null);
		busy = null;
		if (waiting) send(waiting);
		waiting = null;
	};
	worker.onerror = () => {
		busy?.answer(null);
		busy = null;
		worker?.terminate();
		worker = null;
	};
	busy = { id: nextId++, answer: job.answer };
	worker.postMessage({ id: busy.id, text: job.text });
}

/** the main file's prose count of `text`, null when it could not be counted or a newer text took its place */
export function countLatexInWorker(text: string): Promise<ProseCount | null> {
	return new Promise((answer) => {
		const job = { text, answer };
		if (!busy) return send(job);
		waiting?.answer(null);
		waiting = job;
	});
}
