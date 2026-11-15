// Main-process end of the helper thread (helperWorker.ts): one id per call, events fanned out to
// subscribers, started again if it dies. Started on first use and only once shellEnv has the
// user's PATH, since the thread takes a copy of the environment it is started with.
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { shellEnvReady } from '../shell/shellEnv';
import { onToolPathChange } from '../shell/toolDirs';
import { timeSync } from '../startupStats';

export type HelperEvent = { event: string; key: string; data?: unknown };
type Reply = { id: number; ok: boolean; value?: unknown; error?: string };
type Waiter = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let thread: Worker | null = null;
let starts = 0;
let nextId = 1;
const waiting = new Map<number, Waiter>();
const listeners = new Set<(e: HelperEvent) => void>();
const restartHooks = new Set<() => void>();

// started with a copy of the environment, so a PATH moved by Preferences has to be sent over
onToolPathChange((p) => {
	if (thread) void helperCall('env.path', [p]).catch(() => {});
});

function start(): Worker {
	const w = timeSync('start helper thread', () => new Worker(path.join(__dirname, 'helperWorker.js')));
	starts++;
	w.on('message', (msg: Reply | HelperEvent) => {
		if ('event' in msg) {
			for (const l of listeners) l(msg);
			return;
		}
		const waiter = waiting.get(msg.id);
		if (!waiter) return;
		waiting.delete(msg.id);
		if (msg.ok) waiter.resolve(msg.value);
		else waiter.reject(new Error(msg.error ?? 'helper failed'));
	});
	// an error ends the thread, and its exit settles the calls
	w.on('error', (e) => console.error('helper thread:', e));
	w.on('exit', (code) => {
		if (thread === w) thread = null;
		for (const waiter of waiting.values()) waiter.reject(new Error(`helper thread exited (${code})`));
		waiting.clear();
	});
	return w;
}

async function ensure(): Promise<Worker> {
	if (thread) return thread;
	await shellEnvReady();
	if (thread) return thread;
	thread = start();
	if (starts > 1) for (const h of restartHooks) h();
	return thread;
}

/** runs one helper op; `git.<gitService, gitHistory, gitRemote or gitCombine export>`, `git.gitClone`,
 *  `watch.start`, `watch.stop` */
export async function helperCall(op: string, args: unknown[]): Promise<unknown> {
	const w = await ensure();
	const id = nextId++;
	return new Promise((resolve, reject) => {
		waiting.set(id, { resolve, reject });
		w.postMessage({ id, op, args });
	});
}

/** returns the unsubscribe */
export function onHelperEvent(fn: (e: HelperEvent) => void): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/** runs after the helper has been started again following a death; state living there is gone */
export function onHelperRestart(fn: () => void): void {
	restartHooks.add(fn);
}
