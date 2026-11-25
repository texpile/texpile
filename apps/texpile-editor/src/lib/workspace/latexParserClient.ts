// main-thread client for the parser worker: hard wall-clock timeout, terminate on
// overrun (a runaway sync parse can't be cancelled any other way), fresh worker next call
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { mdSchema } from '$lib/languages/markdown/visual/schema';
import type { Node as PMNode } from 'prosemirror-model';
import { latexParserWorker, resetLatexParserWorker } from './latexParserWorker';
import { parseBodyOf, type ParsedLatexFile, type ParsePhase } from './latexRoundtrip';
import { type SourceMap } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap, warnMapDefects } from '$lib/editor/visual/parseOrigins';
import type { DocumentScans } from './documentScans';
import type { PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';

type ParseRequest = {
	id: number;
	source: string;
	projectMacros: string;
	format: 'tex' | 'md';
	table?: PackageTable;
};

type PendingRequest = {
	request: ParseRequest;
	timeoutMs: number;
	resolve: (value: ParsedLatexFile) => void;
	reject: (reason: Error) => void;
	onProgress?: (phase: ParsePhase) => void;
};

type ProgressMessage = {
	type: 'progress';
	id: number;
	phase: ParsePhase;
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
	scans: DocumentScans;
};

type ErrorMessage = {
	type: 'error';
	id: number;
	message: string;
};

type WorkerMessage = ResultMessage | ErrorMessage | ProgressMessage;

/** timeout errors carry this exact message so callers can pick them out. */
export const PARSE_TIMEOUT = 'parse-timeout';
/** a parse its caller gave up on, whose result is not rebuilt here */
export const PARSE_ABANDONED = 'parse-abandoned';

// the worker reads one file at a time, so a parse's deadline starts when the worker takes it up: timed from the post,
// the parse of the file just left, queued behind a long one, ran out and took the long one down with the worker
const queue: PendingRequest[] = [];
let running: { pend: PendingRequest; timeoutId: ReturnType<typeof setTimeout> } | null = null;
let nextId = 1;
let wired = false;
/** the parses whose callers have their answer (abandoned ones too): a result that still comes back is dropped */
const answered = new WeakSet<PendingRequest>();

function settle(pend: PendingRequest, outcome: () => ParsedLatexFile | Error): void {
	if (answered.has(pend)) return;
	answered.add(pend);
	try {
		const value = outcome();
		if (value instanceof Error) pend.reject(value);
		else pend.resolve(value);
	} catch (err) {
		pend.reject(err instanceof Error ? err : new Error(String(err)));
	}
}

// the document and its source map in two tasks: together they held a long paper's main thread for 360 ms
async function rebuild(pend: PendingRequest, msg: ResultMessage): Promise<void> {
	if (answered.has(pend)) return;
	let doc: PMNode;
	try {
		doc = (pend.request.format === 'md' ? mdSchema : schema).nodeFromJSON(msg.docJSON);
	} catch (err) {
		return settle(pend, () => (err instanceof Error ? err : new Error(String(err))));
	}
	await new Promise((next) => setTimeout(next));
	settle(pend, () => {
		// the map crossed as data; the nodes it describes are these, not the worker's
		const meta = { preamble: msg.preamble, postamble: msg.postamble, hadDocumentEnv: msg.hadDocumentEnv };
		const origins = rememberParseMap(doc, msg.map, parseBodyOf(meta, pend.request.source));
		warnMapDefects('latexParserClient', origins);
		return { doc, ...meta, warnings: msg.warnings, map: msg.map, origins, table: pend.request.table, scans: msg.scans };
	});
}

/** the running parse is over, however it ended: the next one goes to the worker */
function finish(): PendingRequest | null {
	if (!running) return null;
	const { pend, timeoutId } = running;
	clearTimeout(timeoutId);
	running = null;
	queueMicrotask(next);
	return pend;
}

function next(): void {
	if (running) return;
	const pend = queue.shift();
	if (!pend) return;
	const timeoutId = setTimeout(() => {
		if (running?.pend !== pend) return;
		finish();
		// terminate the runaway worker; a new one boots for the next parse
		dropWorker();
		settle(pend, () => new Error(PARSE_TIMEOUT));
	}, pend.timeoutMs);
	running = { pend, timeoutId };
	ensureWorker().postMessage(pend.request);
}

function ensureWorker(): Worker {
	const w = latexParserWorker();
	if (wired) return w;
	wired = true;
	w.onmessage = (event: MessageEvent<WorkerMessage>) => {
		const msg = event.data;
		if (running?.pend.request.id !== msg.id) return;
		if (msg.type === 'progress') {
			if (!answered.has(running.pend)) running.pend.onProgress?.(msg.phase);
			return;
		}
		const pend = finish()!;
		if (msg.type === 'result') void rebuild(pend, msg);
		else settle(pend, () => new Error(msg.message));
	};
	// the worker itself crashed: the running parse fails with the real reason instead of a false timeout, and the
	// queued ones go to a fresh worker
	w.onerror = (event: ErrorEvent) => {
		const pend = finish();
		dropWorker();
		if (pend) settle(pend, () => new Error(event.message || 'Worker crashed'));
	};
	return w;
}

function dropWorker(): void {
	wired = false;
	resetLatexParserWorker();
}

/** off-main-thread parse; settles by timeoutMs from when the worker takes it up, terminating the worker on overrun so a
 *  runaway parse can't keep chewing CPU. */
export function parseLatexFileAsync(
	source: string,
	projectMacros = '',
	timeoutMs = 3000,
	onProgress?: (phase: ParsePhase) => void,
	format: 'tex' | 'md' = 'tex',
	table?: PackageTable,
	abandon?: AbortSignal
): Promise<ParsedLatexFile> {
	return new Promise((resolve, reject) => {
		const request = { id: nextId++, source, projectMacros, format, table };
		const pend: PendingRequest = { request, timeoutMs, resolve, reject, onProgress };
		abandon?.addEventListener(
			'abort',
			() => {
				const at = queue.indexOf(pend);
				if (at >= 0) queue.splice(at, 1);
				settle(pend, () => new Error(PARSE_ABANDONED));
			},
			{ once: true }
		);
		queue.push(pend);
		next();
	});
}
