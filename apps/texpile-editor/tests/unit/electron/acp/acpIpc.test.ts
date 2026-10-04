// A window's agent starts after main has waited on the login shell's PATH and on Texpile's own tools endpoint. A close
// from the window in either wait has to leave nothing running. Electron, settings and the session are stood in for
import { it, expect, vi, beforeEach } from 'vitest';

type Handler = (e: { sender: unknown }, ...args: unknown[]) => unknown;
type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
	let resolve = () => {};
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

const h = vi.hoisted(() => ({
	handlers: new Map<string, Handler>(),
	sessions: [] as { started: boolean; closed: boolean }[],
	shellEnv: Promise.resolve(),
	mcp: Promise.resolve(),
	mcpAsked: false
}));

vi.mock('electron', () => ({
	app: { getVersion: () => '0.0.0' },
	ipcMain: {
		handle: (channel: string, fn: Handler) => h.handlers.set(channel, fn),
		on: (channel: string, fn: Handler) => h.handlers.set(channel, fn)
	}
}));
vi.mock('../../../../../../electron/src/appSettings', () => ({ readSettings: () => ({ agentPanel: 'opencode', agentPanelCommand: '' }) }));
vi.mock('../../../../../../electron/src/appIdentity', () => ({ agentsDir: () => '/agents' }));
vi.mock('../../../../../../electron/src/shell/findProgram', () => ({ findProgram: (name: string) => `/bin/${name}` }));
vi.mock('../../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: () => h.shellEnv }));
vi.mock('../../../../../../electron/src/windows/windowRegistry', () => ({ folderOf: () => '/project' }));
vi.mock('../../../../../../electron/src/ipc/mcpIpc', () => ({ mcpHost: () => ({}) }));
vi.mock('../../../../../../electron/src/mcp/server', () => ({
	startPrivate: async () => {
		h.mcpAsked = true;
		await h.mcp;
		return { url: 'http://127.0.0.1:1', grant: () => 'token', revoke: () => {}, close: async () => {} };
	}
}));
vi.mock('../../../../../../electron/src/ai/acp/acpSession', () => ({
	AcpSession: class {
		started = false;
		closed = false;
		constructor() {
			h.sessions.push(this);
		}
		start(): Promise<void> {
			this.started = true;
			return Promise.resolve();
		}
		close(): void {
			this.closed = true;
		}
	}
}));

const wc = { id: 7, isDestroyed: () => false, send: () => {}, once: () => {} };
const call = (channel: string) => h.handlers.get(channel)!({ sender: wc });

beforeEach(async () => {
	// a fresh module each time: the tools endpoint is started once and kept
	vi.resetModules();
	h.handlers.clear();
	h.sessions = [];
	h.mcpAsked = false;
	(await import('../../../../../../electron/src/ai/acp/acpIpc')).registerAcpIpc();
});

it('starts nothing when the window closes the agent while main waits on the PATH', async () => {
	const shellEnv = deferred();
	h.shellEnv = shellEnv.promise;
	h.mcp = Promise.resolve();
	const started = call('acp:start');
	call('acp:close');
	shellEnv.resolve();
	await started;
	expect(h.sessions.filter((s) => !s.closed)).toEqual([]);
});

it('starts nothing when the window closes the agent while main waits on its tools endpoint, and starts one with no close', async () => {
	const mcp = deferred();
	h.shellEnv = Promise.resolve();
	h.mcp = mcp.promise;
	const started = call('acp:start');
	await vi.waitFor(() => expect(h.mcpAsked).toBe(true));
	call('acp:close');
	mcp.resolve();
	await started;
	expect(h.sessions.filter((s) => !s.closed)).toEqual([]);
	await call('acp:start');
	expect(h.sessions.filter((s) => s.started && !s.closed)).toHaveLength(1);
});
