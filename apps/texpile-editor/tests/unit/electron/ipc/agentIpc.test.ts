// A Refine run belongs to the window that asked for it, and a window that closes can no longer cancel it. Electron,
// settings and the agent itself are stood in for
import { it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';

type Handler = (e: { sender: unknown }, ...args: unknown[]) => unknown;

const h = vi.hoisted(() => ({ handlers: new Map<string, Handler>(), signals: [] as AbortSignal[] }));

vi.mock('electron', () => ({
	app: { getVersion: () => '0.0.0' },
	ipcMain: {
		handle: (channel: string, fn: Handler) => h.handlers.set(channel, fn),
		on: (channel: string, fn: Handler) => h.handlers.set(channel, fn)
	}
}));
vi.mock('../../../../../../electron/src/appSettings', () => ({ readSettings: () => ({ refineAgents: ['claude'], aiAgentModels: {} }) }));
vi.mock('../../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: () => Promise.resolve() }));
vi.mock('../../../../../../electron/src/ai/runAgent', () => ({
	runAgent: (_argv: string[], _prompt: unknown, signal: AbortSignal) => {
		h.signals.push(signal);
		return new Promise((resolve) => signal.addEventListener('abort', () => resolve({ ok: false, error: 'cancelled', cancelled: true })));
	}
}));

const { registerAgentIpc } = await import('../../../../../../electron/src/ipc/agentIpc');
registerAgentIpc();

it('stops the agent of a window that closes while it runs', async () => {
	const wc = Object.assign(new EventEmitter(), { id: 3 });
	const run = h.handlers.get('agent:run')!({ sender: wc }, { id: 'refine-1', prompt: 'shorter', system: '', agent: 'claude' });
	await vi.waitFor(() => expect(h.signals).toHaveLength(1));
	wc.emit('destroyed');
	expect(h.signals[0].aborted).toBe(true);
	await run;
	expect(wc.listenerCount('destroyed')).toBe(0);
});
