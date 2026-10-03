// A window that closes or reloads runs none of its own teardown, so the shells it spawned are main's to end. Electron and
// node-pty are stood in for
import { it, expect, vi, beforeAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

type Handler = (e: { sender: unknown }, ...args: unknown[]) => unknown;

const h = vi.hoisted(() => ({ handlers: new Map<string, Handler>() }));

vi.mock('electron', () => ({
	app: { getPath: () => '/home' },
	ipcMain: {
		handle: (channel: string, fn: Handler) => h.handlers.set(channel, fn),
		on: (channel: string, fn: Handler) => h.handlers.set(channel, fn)
	}
}));
vi.mock('../../../../../../electron/src/shell/shellEnv', () => ({ shellEnvReady: () => Promise.resolve() }));

class FakePty {
	pid = 4242;
	killed = false;
	private exit: ((e: { exitCode: number }) => void) | null = null;
	onData(): void {}
	onExit(cb: (e: { exitCode: number }) => void): void {
		this.exit = cb;
	}
	write(): void {}
	resize(): void {}
	kill(): void {
		this.killed = true;
		this.exit?.({ exitCode: 0 });
	}
}
const spawned: FakePty[] = [];
const envs: Record<string, string>[] = [];

beforeAll(async () => {
	// terminalIpc require()s node-pty, which is native; the stand-in goes where that require looks first
	const req = createRequire(new URL('../../../../../../electron/src/ipc/terminalIpc.ts', import.meta.url));
	const resolved = req.resolve('node-pty');
	req.cache[resolved] = {
		id: resolved,
		filename: resolved,
		loaded: true,
		exports: {
			spawn: (_file: string, _args: string[], opts: { env: Record<string, string> }) => {
				envs.push(opts.env);
				const p = new FakePty();
				spawned.push(p);
				return p;
			}
		}
	} as never;
	(await import('../../../../../../electron/src/ipc/terminalIpc')).registerTerminalIpc();
});

function window(id: number) {
	return Object.assign(new EventEmitter(), { id, isDestroyed: () => false, send: () => {} });
}

it('ends the shells of a window that closes', async () => {
	const wc = window(1);
	expect(await h.handlers.get('terminal:spawn')!({ sender: wc }, { id: 'term-a' })).toMatchObject({ ok: true });
	expect(await h.handlers.get('terminal:spawn')!({ sender: wc }, { id: 'term-b' })).toMatchObject({ ok: true });
	wc.emit('destroyed');
	expect(spawned.map((p) => p.killed)).toEqual([true, true]);
});

it('ends the shells of a window that reloads, and keeps them through a move inside the page', async () => {
	const wc = window(3);
	await h.handlers.get('terminal:spawn')!({ sender: wc }, { id: 'term-d' });
	const shell = spawned[spawned.length - 1];
	wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
	expect(shell.killed).toBe(false);
	wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
	expect(shell.killed).toBe(true);
});

it('leaves no listener on the window once its shell is gone', async () => {
	const wc = window(2);
	await h.handlers.get('terminal:spawn')!({ sender: wc }, { id: 'term-c' });
	h.handlers.get('terminal:kill')!({ sender: wc }, { id: 'term-c' });
	expect(wc.listenerCount('destroyed') + wc.listenerCount('did-start-navigation')).toBe(0);
});

it('leaves the shell its own lookup of a script in the folder, which main turns off for itself', async () => {
	const before = process.env.NoDefaultCurrentDirectoryInExePath;
	process.env.NoDefaultCurrentDirectoryInExePath = '1';
	try {
		await h.handlers.get('terminal:spawn')!({ sender: window(4) }, { id: 'term-e' });
	} finally {
		if (before === undefined) delete process.env.NoDefaultCurrentDirectoryInExePath;
		else process.env.NoDefaultCurrentDirectoryInExePath = before;
	}
	expect(envs[envs.length - 1]).not.toHaveProperty('NoDefaultCurrentDirectoryInExePath');
});
