// latest-wins client for labels.worker.ts. results are advisory (completion registries), so a
// superseded or failed request resolves null and the caller just keeps its previous state.
import type { BibItemSlice } from './labels';

export interface DocRefs {
	labels: string[];
	bibitems: BibItemSlice[];
}

let worker: Worker | null = null;
let nextId = 1;
let latestId = 0;
const pending = new Map<number, { resolve: (refs: DocRefs | null) => void; timeoutId: ReturnType<typeof setTimeout> }>();

function settleAll(value: null) {
	for (const [, p] of pending) {
		clearTimeout(p.timeoutId);
		p.resolve(value);
	}
	pending.clear();
}

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL('./labels.worker.ts', import.meta.url), { type: 'module' });
	w.onmessage = (event: MessageEvent<{ id: number; refs: DocRefs }>) => {
		const { id, refs } = event.data;
		const p = pending.get(id);
		if (!p) return;
		pending.delete(id);
		clearTimeout(p.timeoutId);
		p.resolve(id === latestId ? refs : null);
	};
	w.onerror = () => {
		settleAll(null);
		worker?.terminate();
		worker = null;
	};
	worker = w;
	return w;
}

/** Off-main-thread extractDocRefs. Resolves null when superseded, timed out, or the worker died. */
export function extractDocRefsAsync(latex: string, timeoutMs = 10000): Promise<DocRefs | null> {
	return new Promise((resolve) => {
		const w = ensureWorker();
		const id = nextId++;
		latestId = id;
		const timeoutId = setTimeout(() => {
			if (!pending.has(id)) return;
			pending.delete(id);
			resolve(null);
			// a runaway parse would starve every later request; reboot fresh on the next call.
			// only if OUR worker is still live — a prior timeout may have rebooted it, and killing
			// the fresh one would cancel someone else's healthy request. settle everything queued
			// on the dying worker so no orphaned timers survive to shoot the next worker.
			if (worker === w) {
				settleAll(null);
				worker.terminate();
				worker = null;
			}
		}, timeoutMs);
		pending.set(id, { resolve, timeoutId });
		w.postMessage({ id, latex });
	});
}
