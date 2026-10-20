import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { VITE_PORT } from './ports';

const REPO = path.resolve(import.meta.dirname, '../../../../..');
export const FIXTURE = path.resolve(import.meta.dirname, '../fixture');

export type LaunchOptions = {
	/** files written over the fixture copy before launch, by path relative to the folder */
	files?: Record<string, string>;
	/** settings.json in the fresh profile */
	settings?: Record<string, unknown>;
	/** launch on the start screen instead of the folder */
	startScreen?: boolean;
	/** more environment for the app and the programs it starts */
	env?: Record<string, string>;
};

export type TexpileWindow = {
	app: ElectronApplication;
	page: Page;
	/** the folder copy the window has open */
	root: string;
	userData: string;
	/** page errors and console errors since the last take */
	takeErrors(): string[];
	close(): Promise<void>;
};

// noise from the dev server and Chromium, never from the app
const IGNORED = [/Download the React DevTools/, /\[vite\]/, /Electron Security Warning/, /favicon/];

export async function launchTexpile(options: LaunchOptions = {}): Promise<TexpileWindow> {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-it-'));
	const root = path.join(tmp, 'folder');
	const userData = path.join(tmp, 'profile');
	fs.cpSync(FIXTURE, root, { recursive: true });
	for (const [rel, text] of Object.entries(options.files ?? {})) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
		fs.writeFileSync(path.join(root, rel), text);
	}
	fs.mkdirSync(userData, { recursive: true });
	if (options.settings) fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(options.settings));

	const executablePath = createRequire(path.join(REPO, 'package.json'))('electron') as unknown as string;
	let app: ElectronApplication | null = null;
	const errors: string[] = [];
	try {
		app = await electron.launch({
			executablePath,
			// containers run as root, where Chromium refuses its sandbox
			args: [...(process.platform === 'linux' ? ['--no-sandbox'] : []), REPO, ...(options.startScreen ? [] : [root])],
			env: { ...process.env, ...options.env, ELECTRON_START_URL: `http://127.0.0.1:${VITE_PORT}`, TEXPILE_USER_DATA: userData },
			timeout: 180_000
		});
		const page = await app.firstWindow();
		page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
		page.on('console', (m) => {
			if (m.type() === 'error' && !IGNORED.some((re) => re.test(m.text()))) errors.push(`console: ${m.text()}`);
		});
		await page.waitForLoadState('domcontentloaded');
		if (!options.startScreen) await page.locator('.ProseMirror, .cm-editor').first().waitFor({ timeout: 180_000 });
	} catch (e) {
		await app?.close().catch(() => {});
		fs.rmSync(tmp, { recursive: true, force: true });
		throw e;
	}
	const page = await app.firstWindow();
	const opened = app;
	return {
		app: opened,
		page,
		root,
		userData,
		takeErrors: () => errors.splice(0),
		async close() {
			await opened.close().catch(() => {});
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	};
}
