// main-thread client for the parser worker: hard wall-clock timeout, terminate on
// overrun (a runaway sync parse can't be cancelled any other way), fresh worker next call
import { schema } from '$lib/schema/schema';
import type { Node as PMNode } from 'prosemirror-model';
import type { ParsedLatexFile, ParsePhase } from './latexRoundtrip';

interface PendingRequest {
	resolve: (value: ParsedLatexFile) => void;
	reject: (reason: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
	onProgress?: (phase: ParsePhase) => void;
}

interface ProgressMessage {
	type: 'progress';
	id: number;
	phase: ParsePhase;
}

interface TooComplexMessage {
	type: 'too-complex';
	id: number;
	nodeCount: number;
}

interface ResultMessage {
	type: 'result';
	id: number;
	preamble: string;
	postamble: string;
	hadDocumentEnv: boolean;
	warnings: string[];
	docJSON: Record<string, unknown>;
}

interface ErrorMessage {
	type: 'error';
	id: number;
	message: string;
}

type WorkerMessage = ResultMessage | ErrorMessage | ProgressMessage | TooComplexMessage;

/** timeout errors carry this exact message so callers can pick them out. */
export const PARSE_TIMEOUT = 'parse-timeout';
/** the doc parsed fine but is too big for the view layer to render; message is `too-complex:<n>`. */
export const PARSE_TOO_COMPLEX = 'too-complex';

let worker: Worker | null = null;
const pending = new Map<number, PendingRequest>();
let nextId = 1;

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL('./latexParser.worker.ts', import.meta.url), { type: 'module' });
	w.onmessage = (event: MessageEvent<WorkerMessage>) => {
		const msg = event.data;
		const pend = pending.get(msg.id);
		if (!pend) return; // superseded / timed-out already
		if (msg.type === 'progress') {
			pend.onProgress?.(msg.phase); // still in flight: don't settle
			return;
		}
		pending.delete(msg.id);
		if (msg.type === 'too-complex') {
			clearTimeout(pend.timeoutId);
			pend.reject(new Error(`${PARSE_TOO_COMPLEX}:${msg.nodeCount}`));
			return;
		}
		clearTimeout(pend.timeoutId);
		if (msg.type === 'result') {
			try {
				const doc: PMNode = schema.nodeFromJSON(msg.docJSON);
				pend.resolve({
					doc,
					preamble: msg.preamble,
					postamble: msg.postamble,
					hadDocumentEnv: msg.hadDocumentEnv,
					warnings: msg.warnings
				});
			} catch (err) {
				pend.reject(err instanceof Error ? err : new Error(String(err)));
			}
		} else {
			pend.reject(new Error(msg.message));
		}
	};
	// if the worker itself crashes, reject pending requests with the real reason instead of letting
	// them hit the timeout and falsely report a slow parse; tear down so the next call boots fresh
	w.onerror = (event: ErrorEvent) => {
		const message = event.message || 'Worker crashed';
		for (const [, pend] of pending) {
			clearTimeout(pend.timeoutId);
			pend.reject(new Error(message));
		}
		pending.clear();
		worker?.terminate();
		worker = null;
	};
	worker = w;
	return w;
}

/** off-main-thread parse; settles by timeoutMs, terminating the worker on overrun so a runaway parse can't keep chewing CPU. */
export function parseLatexFileAsync(
	source: string,
	projectMacros = '',
	timeoutMs = 3000,
	onProgress?: (phase: ParsePhase) => void,
	maxNodes = 0
): Promise<ParsedLatexFile> {
	return new Promise((resolve, reject) => {
		const w = ensureWorker();
		const id = nextId++;
		const timeoutId = setTimeout(() => {
			if (!pending.has(id)) return;
			pending.delete(id);
			// terminate the runaway worker; a new one boots on the next call
			worker?.terminate();
			worker = null;
			reject(new Error(PARSE_TIMEOUT));
		}, timeoutMs);
		pending.set(id, { resolve, reject, timeoutId, onProgress });
		w.postMessage({ id, source, projectMacros, maxNodes });
	});
}
