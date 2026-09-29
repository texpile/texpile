// Keep local history, turned off in Preferences, is read by the main process too: a window opened
// before it was turned off still asks to keep its saves, and a rename's entry is written there,
// not by the window. Electron is stood in for; the store is the real one.
import { it, expect, vi, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => Promise<{ ok: boolean; value?: unknown }>>(),
	userData: '',
	localHistory: true
}));
h.userData = mkdtempSync(join(tmpdir(), 'texpile-history-ipc-'));

vi.mock('electron', () => ({
	app: { getPath: () => h.userData },
	ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => Promise<{ ok: boolean }>) => h.handlers.set(channel, fn) }
}));
vi.mock('../../../../../../electron/src/appSettings', () => ({ readSettings: () => ({ localHistory: h.localHistory }) }));
vi.mock('../../../../../../electron/src/appIdentity', () => ({ portable: false }));

const { registerLocalHistoryIpc } = await import('../../../../../../electron/src/ipc/localHistoryIpc');
registerLocalHistoryIpc();

afterAll(() => rmSync(h.userData, { recursive: true, force: true }));

/** what the window gets back from a history:* call */
async function call(channel: string, ...args: unknown[]): Promise<unknown> {
	const res = await h.handlers.get(channel)!({}, ...args);
	expect(res.ok).toBe(true);
	return res.value;
}

const FILE = join(tmpdir(), 'project', 'intro.tex');
const RENAMED = join(tmpdir(), 'project', 'introduction.tex');

it('keeps nothing new while Keep local history is off, and a rename still takes the entries along', async () => {
	expect(await call('history:add', FILE, 'kept while on')).not.toBeNull();
	h.localHistory = false;
	expect(await call('history:add', FILE, 'saved while off')).toBeNull();
	expect(await call('history:move', FILE, RENAMED)).toEqual([RENAMED]);
	const entries = (await call('history:list', RENAMED)) as { source?: string }[];
	expect(entries.map((e) => e.source)).toEqual([undefined]);
	h.localHistory = true;
	expect(await call('history:add', RENAMED, 'saved once on again')).not.toBeNull();
});
