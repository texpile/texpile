import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
	const listeners = new Map<string, (arg: unknown) => void>();
	const appListeners = new Map<string, (...args: unknown[]) => void>();
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
		quitAndInstall: vi.fn(),
		autoInstallOnAppQuit: false
	};
	return { listeners, appListeners, window, updater, userData: { path: '' } };
});

vi.mock('electron', () => ({
	app: {
		getPath: () => h.userData.path,
		getVersion: () => '1.6.2',
		isPackaged: true,
		on: (event: string, fn: (...args: unknown[]) => void) => h.appListeners.set(event, fn)
	},
	BrowserWindow: { getAllWindows: () => [h.window] }
}));
vi.mock('electron-updater', () => ({ autoUpdater: h.updater }));
vi.mock('../../../../../../electron/src/appIdentity', () => ({ portable: false }));
vi.mock('node:fs', async (original) => ({ ...(await original<typeof import('node:fs')>()), readFileSync: () => 'deb' }));

import { applyToolDirs, pathKey, setToolDirs } from '../../../../../../electron/src/shell/toolDirs';
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

	it('ignores a second click while the first install waits, so a cancelled prompt still shows the window', () => {
		h.updater.quitAndInstall.mockClear();
		install();
		install();
		vi.advanceTimersByTime(300);
		expect(h.updater.quitAndInstall).toHaveBeenCalledTimes(1);
		h.listeners.get('error')!(new Error('Request dismissed'));
		expect(h.window.visible).toBe(true);
	});
});

describe('an update installed when Texpile quits', () => {
	it('marks the install and hands the installer the PATH without the folders from Preferences', () => {
		const key = pathKey();
		const saved = process.env[key];
		const base = path.resolve('/', 'system');
		Object.defineProperty(process, 'platform', { value: 'win32' });
		h.userData.path = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-update-'));
		try {
			process.env[key] = base;
			applyToolDirs();
			setToolDirs([path.resolve('/', 'tools')]);
			expect(process.env[key]).not.toBe(base);
			h.appListeners.get('quit')!({}, 0);
			expect(fs.existsSync(path.join(h.userData.path, 'update-installing.json'))).toBe(true);
			expect(process.env[key]).toBe(base);
		} finally {
			Object.defineProperty(process, 'platform', { value: platform });
			setToolDirs([]);
			process.env[key] = saved;
			fs.rmSync(h.userData.path, { recursive: true, force: true });
		}
	});
});
