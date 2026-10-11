import { ipcRenderer } from 'electron';

/** unwraps the { ok, value | error } results from main.ts handleFs back into throw semantics. */
export async function invokeFs(channel: string, ...args: unknown[]): Promise<unknown> {
	const r = (await ipcRenderer.invoke(channel, ...args)) as { ok: boolean; value?: unknown; error?: string };
	if (r && r.ok) return r.value;
	throw new Error(r?.error ?? 'Unknown error');
}
