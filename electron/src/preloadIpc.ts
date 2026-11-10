import { ipcRenderer } from 'electron';
import { DEFERRED_CHANNELS } from './ipc/deferredChannels';

const ready = new Map<string, Promise<unknown>>();

/** an invoke that first waits for main to register the handler, when it is one registered after the window is up */
export async function invokeReady<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
	const group = DEFERRED_CHANNELS.find((c) => channel.startsWith(c));
	if (group) {
		let wait = ready.get(group);
		if (!wait) ready.set(group, (wait = ipcRenderer.invoke('deferred:ready', channel)));
		await wait;
	}
	return (await ipcRenderer.invoke(channel, ...args)) as T;
}

/** unwraps the { ok, value | error } results from main.ts handleFs back into throw semantics. */
export async function invokeFs(channel: string, ...args: unknown[]): Promise<unknown> {
	const r = await invokeReady<{ ok: boolean; value?: unknown; error?: string }>(channel, ...args);
	if (r && r.ok) return r.value;
	throw new Error(r?.error ?? 'Unknown error');
}
