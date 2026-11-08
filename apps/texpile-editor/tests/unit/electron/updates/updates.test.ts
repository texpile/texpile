import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
	const listeners = new Map<string, (arg: unknown) => void>();
	const window = {
		visible: true,
		isDestroyed: () => false,
		isVisible: () => window.visible,
		hide: () => (window.visible = false),
		show: () => (window.visible = true),
		webContents: { send: () => {} }
	};
	const updater = {
		on: (event: string, fn: (arg: unknown) => void) => listeners.set(event, fn),
		downloadUpdate: async () => {},
		quitAndInstall: vi.fn()
	};
	return { listeners, window, updater };
});

vi.mock('electron', () => ({
	app: { getPath: () => '', getVersion: () => '1.6.2', isPackaged: true },
	BrowserWindow: { getAllWindows: () => [h.window] }
}));
vi.mock('electron-updater', () => ({ autoUpdater: h.updater }));
vi.mock('../../../../../../electron/src/appIdentity', () => ({ portable: false }));
vi.mock('node:fs', async (original) => ({ ...(await original<typeof import('node:fs')>()), readFileSync: () => 'deb' }));

import { download, install } from '../../../../../../electron/src/updates/updates';

const platform = process.platform;

describe('a deb update install', () => {
	beforeAll(() => {
		Object.defineProperty(process, 'platform', { value: 'linux' });
		Object.defineProperty(process, 'resourcesPath', { value: '/opt/Texpile/resources', configurable: true });
		vi.useFakeTimers();
	});
	afterAll(() => {
		Object.defineProperty(process, 'platform', { value: platform });
		vi.useRealTimers();
	});

	it('hides the window before the password prompt blocks, and shows it again when the install fails', async () => {
		await download();
		h.listeners.get('update-downloaded')!({ version: '1.6.3', downloadedFile: '/tmp/texpile.deb' });
		install();
		expect(h.window.visible).toBe(false);
		expect(h.updater.quitAndInstall).not.toHaveBeenCalled();
		vi.advanceTimersByTime(300);
		expect(h.updater.quitAndInstall).toHaveBeenCalled();
		h.listeners.get('error')!(new Error('Request dismissed'));
		expect(h.window.visible).toBe(true);
	});
});
