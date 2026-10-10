// main-thread client for the parser worker: hard wall-clock timeout, terminate on
// overrun (a runaway sync parse can't be cancelled any other way), fresh worker next call
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { callWrapperNames } from '$lib/editor/snippets/visual/callWrappers';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import type { Node as PMNode } from 'prosemirror-model';
import { latexParserWorker, resetLatexParserWorker } from './latexParserWorker';
import { parseBodyOf, type ParsedLatexFile, type ParsePhase } from './latexRoundtrip';
import { type SourceMap } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap, warnMapDefects } from '$lib/editor/visual/parseOrigins';

type PendingRequest = {
	resolve: (value: ParsedLatexFile) => void;
	reject: (reason: Error) => void;
	timeoutId: ReturnType<typeof setTimeout>;
	onProgress?: (phase: ParsePhase) => void;
	/** which schema rehydrates the result: each dialect's docs live in its own Schema object */
	format: 'tex' | 'md';
	/** the text sent for parsing: the origins of the rehydrated document slice it */
	source: string;
};

type ProgressMessage = {
	type: 'progress';
	id: number;
	phase: ParsePhase;
};

type TooComplexMessage = {
	type: 'too-complex';
	id: number;
	nodeCount: number;
};

type ResultMessage = {
	type: 'result';
	id: number;
	preamble: string;
	postamble: string;
	hadDocumentEnv: boolean;
	warnings: string[];
	map: SourceMap;
	docJSON: Record<string, unknown>;
};

type ErrorMessage = {
	type: 'error';
	id: number;
	message: string;
};

type WorkerMessage = ResultMessage | ErrorMessage | ProgressMessage | TooComplexMessage;

/** timeout errors carry this exact message so callers can pick them out. */
export const PARSE_TIMEOUT = 'parse-timeout';
/** the doc parsed fine but is too big for the view layer to render; message is `too-complex:<n>`. */
export const PARSE_TOO_COMPLEX = 'too-complex';

const pending = new Map<number, PendingRequest>();
let nextId = 1;
let wired = false;

function ensureWorker(): Worker {
	const w = latexParserWorker();
	if (wired) return w;
	wired = true;
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
				const doc: PMNode = (pend.format === 'md' ? mdSchema : schema).nodeFromJSON(msg.docJSON);
				// the map crossed as data; the nodes it describes are these, not the worker's
				const meta = { preamble: msg.preamble, postamble: msg.postamble, hadDocumentEnv: msg.hadDocumentEnv };
				const origins = rememberParseMap(doc, msg.map, parseBodyOf(meta, pend.source));
				warnMapDefects('latexParserClient', origins);
				pend.resolve({ doc, ...meta, warnings: msg.warnings, map: msg.map, origins });
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
		dropWorker();
	};
	return w;
}

function dropWorker(): void {
	wired = false;
	resetLatexParserWorker();
}

/** off-main-thread parse; settles by timeoutMs, terminating the worker on overrun so a runaway parse can't keep chewing CPU. */
export function parseLatexFileAsync(
	source: string,
	projectMacros = '',
	timeoutMs = 3000,
	onProgress?: (phase: ParsePhase) => void,
	maxNodes = 0,
	format: 'tex' | 'md' = 'tex'
): Promise<ParsedLatexFile> {
	return new Promise((resolve, reject) => {
		const w = ensureWorker();
		const id = nextId++;
		const timeoutId = setTimeout(() => {
			if (!pending.has(id)) return;
			pending.delete(id);
			// terminate the runaway worker; a new one boots on the next call
			dropWorker();
			reject(new Error(PARSE_TIMEOUT));
		}, timeoutMs);
		pending.set(id, { resolve, reject, timeoutId, onProgress, format, source });
		w.postMessage({ id, source, projectMacros, maxNodes, format, callWrappers: callWrapperNames('latex') });
	});
}
