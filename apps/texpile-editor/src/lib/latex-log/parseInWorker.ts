// promise front for parse.worker.ts: one persistent worker, requests correlated by id. kept out
// of index.ts so node-side consumers (tests, sweeps) never touch the Worker constructor.
import type { LatexLogParseResult } from './types';

interface ParseResponse {
	id: number;
	result?: LatexLogParseResult;
	error?: string;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: LatexLogParseResult) => void; reject: (e: Error) => void }>();

function ensureWorker(): Worker {
	if (!worker) {
		worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e: MessageEvent<ParseResponse>) => {
			const req = pending.get(e.data.id);
			if (!req) return;
			pending.delete(e.data.id);
			if (e.data.result) req.resolve(e.data.result);
			else req.reject(new Error(e.data.error ?? 'log parse failed'));
		};
		worker.onerror = (e) => {
			// a dead worker fails everything in flight; the next call spawns a fresh one
			for (const req of pending.values()) req.reject(new Error(e.message || 'log parse worker crashed'));
			pending.clear();
			worker?.terminate();
			worker = null;
		};
	}
	return worker;
}

/** parseCompileDiagnostics, off the renderer thread (a 20MB tracing log parses in ~0.4s there). */
export function parseCompileDiagnosticsInWorker(
	logText: string,
	blgText?: string | null,
	stdoutText?: string | null
): Promise<LatexLogParseResult> {
	const id = ++seq;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		ensureWorker().postMessage({ id, logText, blgText: blgText ?? null, stdoutText: stdoutText ?? null });
	});
}
