// latest-wins client for userMacros.worker.ts. results are advisory (completion cache refills), so
// a superseded or failed request resolves null and the caller just keeps its previous state.
import type { UserMacroDef } from './userMacroScan';

let worker: Worker | null = null;
let nextId = 1;
let latestId = 0;
const pending = new Map<number, { resolve: (macros: UserMacroDef[] | null) => void; timeoutId: ReturnType<typeof setTimeout> }>();

function settleAll(value: null) {
	for (const [, p] of pending) {
		clearTimeout(p.timeoutId);
		p.resolve(value);
	}
	pending.clear();
}

function ensureWorker(): Worker {
	if (worker) return worker;
	const w = new Worker(new URL('./userMacros.worker.ts', import.meta.url), { type: 'module' });
	w.onmessage = (event: MessageEvent<{ id: number; macros: UserMacroDef[] }>) => {
		const { id, macros } = event.data;
		const p = pending.get(id);
		if (!p) return;
		pending.delete(id);
		clearTimeout(p.timeoutId);
		p.resolve(id === latestId ? macros : null);
	};
	w.onerror = () => {
		settleAll(null);
		worker?.terminate();
		worker = null;
	};
	worker = w;
	return w;
}

/** Off-main-thread extractUserMacros. Resolves null when superseded, timed out, or the worker died.
 * The timeout is generous: a 2MB buffer (MAX_SCAN_LENGTH) can legitimately parse for ~15s. */
export function extractUserMacrosAsync(text: string, timeoutMs = 30000): Promise<UserMacroDef[] | null> {
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
		w.postMessage({ id, text });
	});
}
