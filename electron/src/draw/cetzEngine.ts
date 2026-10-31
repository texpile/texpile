// One warm tinymist language server drawing CeTZ figures: each job replaces the text of the one document it has open,
// and is exported as SVG. It runs only while a window's figure tab uses it, as the TikZ engine does
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTinymist, startLsp, type LspHandle } from '../typstService';
import { PROGRAM_MISSING } from './drawDaemon';
import { typstErrors } from './typstErrors';

// a picture that runs longer is taken as stuck: the server ends and the next picture starts a new one
const STUCK_MS = 60_000;

type LspReply = { result?: { items?: { path?: string }[] }; error?: { message: string } };

type Server = {
	lsp: LspHandle;
	dir: string;
	file: string;
	uri: string;
	version: number;
	waiting: Map<number, (reply: LspReply) => void>;
};

export type CetzResult = { svg: string | null; errors: string[]; errorLines: (number | null)[]; ms: number };

let server: Server | null = null;
let queue: Promise<unknown> = Promise.resolve();
// the windows whose figure tabs draw with it
const users = new Set<number>();
let nextId = 1;
const ended = new WeakSet<Server>();

function request(s: Server, method: string, params: unknown): Promise<LspReply> {
	if (ended.has(s)) return Promise.resolve({ error: { message: 'tinymist stopped.' } });
	const id = nextId++;
	const reply = new Promise<LspReply>((resolve) => s.waiting.set(id, resolve));
	s.lsp.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
	return reply;
}

/** every request still waiting is answered, so no picture waits on a server that is gone */
function end(s: Server): void {
	if (ended.has(s)) return;
	ended.add(s);
	for (const reply of s.waiting.values()) reply({ error: { message: 'tinymist stopped.' } });
	s.waiting.clear();
	if (server === s) server = null;
	fs.rm(s.dir, { recursive: true, force: true }, () => {});
}

function notify(s: Server, method: string, params: unknown): void {
	s.lsp.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
}

function answer(s: Server, json: string): void {
	const msg = JSON.parse(json) as LspReply & { id?: number; method?: string };
	if (msg.id === undefined) return;
	// the server's own requests (its configuration) take the defaults
	if (msg.method) return s.lsp.send(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: null }));
	s.waiting.get(msg.id)?.(msg);
	s.waiting.delete(msg.id);
}

async function start(userData: string): Promise<Server> {
	const found = await resolveTinymist(userData);
	if (!found) throw new Error(`${PROGRAM_MISSING}tinymist`);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-cetz-'));
	const file = path.join(dir, 'figure.typ');
	const s = { dir, file, uri: pathToFileURL(file).href, version: 0, waiting: new Map() } as unknown as Server;
	s.lsp = startLsp(found.command, dir, {
		message: (json) => answer(s, json),
		exit: () => end(s)
	});
	const ready = await request(s, 'initialize', {
		processId: process.pid,
		rootUri: pathToFileURL(dir).href,
		capabilities: {},
		initializationOptions: { exportPdf: 'never' }
	});
	if (ready.error) throw new Error(ready.error.message);
	notify(s, 'initialized', {});
	return s;
}

function stop(s: Server): void {
	s.lsp.stop();
	end(s);
}

async function drawOne(userData: string, job: string): Promise<CetzResult> {
	const t0 = performance.now();
	const s = (server ??= await start(userData));
	s.version++;
	if (s.version === 1) notify(s, 'textDocument/didOpen', { textDocument: { uri: s.uri, languageId: 'typst', version: 1, text: job } });
	else notify(s, 'textDocument/didChange', { textDocument: { uri: s.uri, version: s.version }, contentChanges: [{ text: job }] });
	const timer = setTimeout(() => stop(s), STUCK_MS);
	const reply = await request(s, 'workspace/executeCommand', { command: 'tinymist.exportSvg', arguments: [s.file] });
	clearTimeout(timer);
	const ms = performance.now() - t0;
	if (reply.error) {
		const { errors, errorLines } = typstErrors(reply.error.message, s.file);
		return { svg: null, errors: errors.length ? errors : [reply.error.message], errorLines: errors.length ? errorLines : [null], ms };
	}
	const out = reply.result?.items?.[0]?.path;
	const svg = out && fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
	return svg ? { svg, errors: [], errorLines: [], ms } : { svg: null, errors: ['Typst gave no page.'], errorLines: [null], ms };
}

/** one instrumented CeTZ picture, a whole Typst document, drawn by the warm tinymist; `user` is the asking window */
export function renderCetz(userData: string, job: string, user: number): Promise<CetzResult> {
	users.add(user);
	const next = queue.then(() => drawOne(userData, job));
	queue = next.catch(() => {});
	return next;
}

/** the server stops once the pictures already asked for are drawn, unless `keep` says another window still uses it */
function stopAfterQueue(keep: () => boolean): void {
	const s = server;
	if (!s) return;
	void queue.then(() => {
		if (server === s && !keep()) stop(s);
	});
}

/** a window's figure tabs are done: the server stops when no other window uses it */
export function releaseCetz(user: number): void {
	users.delete(user);
	if (!users.size) stopAfterQueue(() => users.size > 0);
}

/** Draw again: the next picture starts a new server, another window's pictures in this one finishing first */
export function restartCetz(user: number): void {
	if (users.has(user)) stopAfterQueue(() => false);
}
