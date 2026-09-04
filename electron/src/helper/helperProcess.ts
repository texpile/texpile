// Main-process end of the helper utility process (helperWorker.ts): one id per call, events
// fanned out to subscribers, forked again if it dies. Forked on first use and only once shellEnv
// has the user's PATH, since the process inherits the environment it is forked with.
import { utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import { shellEnvReady } from '../shell/shellEnv';
import { timeSync } from '../startupStats';

export type HelperEvent = { event: string; key: string };
type Reply = { id: number; ok: boolean; value?: unknown; error?: string };
type Waiter = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let proc: UtilityProcess | null = null;
let forks = 0;
let nextId = 1;
const waiting = new Map<number, Waiter>();
const listeners = new Set<(e: HelperEvent) => void>();
const reforkHooks = new Set<() => void>();

function start(): UtilityProcess {
	const p = timeSync('fork helper process', () =>
		utilityProcess.fork(path.join(__dirname, 'helperWorker.js'), [], { serviceName: 'Texpile helper' })
	);
	forks++;
	p.on('message', (msg: Reply | HelperEvent) => {
		if ('event' in msg) {
			for (const l of listeners) l(msg);
			return;
		}
		const w = waiting.get(msg.id);
		if (!w) return;
		waiting.delete(msg.id);
		if (msg.ok) w.resolve(msg.value);
		else w.reject(new Error(msg.error ?? 'helper failed'));
	});
	p.on('exit', (code) => {
		if (proc === p) proc = null;
		for (const w of waiting.values()) w.reject(new Error(`helper process exited (${code})`));
		waiting.clear();
	});
	return p;
}

async function ensure(): Promise<UtilityProcess> {
	if (proc) return proc;
	await shellEnvReady();
	if (proc) return proc;
	proc = start();
	if (forks > 1) for (const h of reforkHooks) h();
	return proc;
}

/** runs one helper op; `git.<gitService export>`, `watch.start`, `watch.stop` */
export async function helperCall(op: string, args: unknown[]): Promise<unknown> {
	const p = await ensure();
	const id = nextId++;
	return new Promise((resolve, reject) => {
		waiting.set(id, { resolve, reject });
		p.postMessage({ id, op, args });
	});
}

export function onHelperEvent(fn: (e: HelperEvent) => void): void {
	listeners.add(fn);
}

/** runs after the helper has been forked again following a death; state living there is gone */
export function onHelperRefork(fn: () => void): void {
	reforkHooks.add(fn);
}
