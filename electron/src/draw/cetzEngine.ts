import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { onToolPathChange } from '../shell/toolDirs';
import { resolveTinymist, startLsp, type LspHandle } from '../typstService';
import { PROGRAM_MISSING } from './drawDaemon';
import { typstErrors } from './typstErrors';

// a picture that runs longer is taken as stuck: the server ends and the next picture starts a new one
const STUCK_MS = 60_000;
// the first picture of a project fetches CeTZ from Typst's registry
const FIRST_MS = 300_000;
// two projects' figures side by side keep a server each; Typst reads no file outside its root
const MAX_WARM = 3;

type LspReply = { result?: { items?: { path?: string }[] }; error?: { message: string } };

type Server = {
	lsp: LspHandle;
	root: string;
	out: string;
	open: Map<string, number>;
	/** it has drawn a picture, so it holds its packages */
	drew: boolean;
	waiting: Map<number, (reply: LspReply) => void>;
};

type Entry = { root: string; ready: Promise<Server>; queue: Promise<unknown>; users: Set<number>; used: number };

export type CetzResult = { svg: string | null; errors: string[]; errorLines: (number | null)[]; ms: number };

const entries = new Map<string, Entry>();
let nextId = 1;
const ended = new WeakSet<Server>();

function request(s: Server, method: string, params: unknown): Promise<LspReply> {
	if (ended.has(s)) return Promise.resolve({ error: { message: 'tinymist stopped.' } });
	const id = nextId++;
	const reply = new Promise<LspReply>((resolve) => s.waiting.set(id, resolve));
	s.lsp.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
	return reply;
}

function end(s: Server): void {
	if (ended.has(s)) return;
	ended.add(s);
	for (const reply of s.waiting.values()) reply({ error: { message: 'tinymist stopped.' } });
	s.waiting.clear();
	const e = entries.get(s.root);
	if (e) void e.ready.then((now) => now === s && entries.get(s.root) === e && entries.delete(s.root)).catch(() => {});
	fs.rm(s.out, { recursive: true, force: true }, () => {});
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

async function start(userData: string, root: string): Promise<Server> {
	const found = await resolveTinymist(userData);
	if (!found) throw new Error(`${PROGRAM_MISSING}tinymist`);
	const out = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-cetz-'));
	const s = { root, out, open: new Map(), drew: false, waiting: new Map() } as unknown as Server;
	s.lsp = startLsp(found.command, root, {
		message: (json) => answer(s, json),
		exit: () => end(s)
	});
	const silent = setTimeout(() => stop(s), STUCK_MS);
	const ready = await request(s, 'initialize', {
		processId: process.pid,
		rootUri: pathToFileURL(root).href,
		capabilities: {},
		initializationOptions: { exportPdf: 'never', outputPath: path.join(out, '$name') }
	});
	clearTimeout(silent);
	if (ready.error) throw new Error(ready.error.message);
	notify(s, 'initialized', {});
	return s;
}

function stop(s: Server): void {
	s.lsp.stop();
	end(s);
}

async function drawOne(s: Server, file: string, job: string): Promise<CetzResult> {
	const t0 = performance.now();
	const uri = pathToFileURL(file).href;
	const version = (s.open.get(uri) ?? 0) + 1;
	s.open.set(uri, version);
	if (version === 1) notify(s, 'textDocument/didOpen', { textDocument: { uri, languageId: 'typst', version, text: job } });
	else notify(s, 'textDocument/didChange', { textDocument: { uri, version }, contentChanges: [{ text: job }] });
	const timer = setTimeout(() => stop(s), s.drew ? STUCK_MS : FIRST_MS);
	const reply = await request(s, 'workspace/executeCommand', { command: 'tinymist.exportSvg', arguments: [file] });
	clearTimeout(timer);
	s.drew = true;
	const ms = performance.now() - t0;
	if (reply.error) {
		const { errors, errorLines } = typstErrors(reply.error.message, file);
		return { svg: null, errors: errors.length ? errors : [reply.error.message], errorLines: errors.length ? errorLines : [null], ms };
	}
	const out = reply.result?.items?.[0]?.path;
	const svg = out && fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
	if (out) fs.rm(out, { force: true }, () => {});
	return svg ? { svg, errors: [], errorLines: [], ms } : { svg: null, errors: ['Typst gave no page.'], errorLines: [null], ms };
}

function retire(e: Entry): void {
	if (entries.get(e.root) === e) entries.delete(e.root);
	void e.queue.then(async () => {
		const s = await e.ready.catch(() => null);
		if (s) stop(s);
	});
}

export function renderCetz(userData: string, body: { root: string; path: string; job: string }, user: number): Promise<CetzResult> {
	const below = body.root ? path.relative(body.root, body.path) : '';
	const root = below && below.split(path.sep)[0] !== '..' && !path.isAbsolute(below) ? body.root : path.dirname(body.path);
	let e = entries.get(root);
	if (!e) {
		const made: Entry = { root, ready: start(userData, root), queue: Promise.resolve(), users: new Set(), used: 0 };
		made.ready.catch(() => entries.get(root) === made && entries.delete(root));
		entries.set(root, made);
		e = made;
	}
	e.users.add(user);
	e.used = performance.now();
	const entry = e;
	const next = e.queue.then(async () => drawOne(await entry.ready, body.path, body.job));
	e.queue = next.catch(() => {});
	const idle = [...entries.values()].sort((a, b) => a.used - b.used);
	for (const old of idle.slice(0, Math.max(0, entries.size - MAX_WARM))) retire(old);
	return next;
}

export function releaseCetz(user: number): void {
	for (const e of [...entries.values()]) {
		e.users.delete(user);
		if (!e.users.size) retire(e);
	}
}

export function restartCetz(user: number): void {
	for (const e of [...entries.values()]) if (e.users.has(user)) retire(e);
}

export function stopCetz(): void {
	for (const e of [...entries.values()]) void e.ready.then(stop, () => {});
}

onToolPathChange(() => {
	for (const e of [...entries.values()]) retire(e);
});

export function warmCetzCount(): number {
	return entries.size;
}
