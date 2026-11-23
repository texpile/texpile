// the canvas editor alone in plain Chromium (apps/texpile-editor/harness): a window-shaped object for the canvas specs
import { chromium, firefox, webkit, type Browser } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { VITE_PORT } from './ports';
import { copyFixtureFolder, IGNORED, type LaunchOptions, type TexpileWindow } from './launch';

export type HarnessWindow = TexpileWindow;

const BINARY = /\.(png|jpe?g|gif|pdf)$/i;
// the page has no texfile:// protocol: a figure the paper names fails to load as a missing one does in the app
const NO_FILE_PROTOCOL = /Failed to load resource: net::ERR_(UNKNOWN_URL_SCHEME|FAILED)|texfile:\/\/.* blocked by CORS policy/;

function readFolder(root: string): { files: Record<string, string>; binary: Record<string, string> } {
	const files: Record<string, string> = {};
	const binary: Record<string, string> = {};
	for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const abs = path.join(entry.parentPath, entry.name);
		const rel = path.relative(root, abs).split(path.sep).join('/');
		if (BINARY.test(rel)) binary[rel] = fs.readFileSync(abs).toString('base64');
		else files[rel] = fs.readFileSync(abs, 'utf8');
	}
	return { files, binary };
}

export type HarnessBrowser = 'chromium' | 'firefox' | 'webkit';

const EXECUTABLES: Record<HarnessBrowser, string | undefined> = {
	chromium: process.env.TEXPILE_CHROMIUM,
	firefox: process.env.TEXPILE_FIREFOX,
	webkit: process.env.TEXPILE_WEBKIT
};

// one browser for every file the worker runs, started on the first window
const shared = new Map<HarnessBrowser, Promise<Browser>>();
function sharedBrowser(name: HarnessBrowser): Promise<Browser> {
	let browser = shared.get(name);
	if (browser) return browser;
	const executablePath = EXECUTABLES[name] || undefined;
	browser =
		name === 'chromium'
			? // containers run as root, where Chromium refuses its sandbox
				chromium.launch({ args: process.platform === 'linux' ? ['--no-sandbox'] : [], executablePath })
			: (name === 'firefox' ? firefox : webkit).launch({ executablePath });
	shared.set(name, browser);
	return browser;
}

/** a new page of the shared browser on a copy of the fixture folder held in memory; what the editor writes lands in the copy */
export async function openCanvasHarness(
	options: LaunchOptions = {},
	browser: HarnessBrowser = 'chromium',
	touch = false
): Promise<HarnessWindow> {
	const { tmp, root, userData } = copyFixtureFolder(options);
	const context = await (
		await sharedBrowser(browser)
	).newContext({ viewport: { width: 1280, height: 860 }, baseURL: `http://127.0.0.1:${VITE_PORT}`, hasTouch: touch });
	if (options.hideEditContext) await context.addInitScript(() => delete (window as { EditContext?: unknown }).EditContext);
	const page = await context.newPage();
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
	page.on('console', (m) => {
		if (m.type() !== 'error' || IGNORED.some((re) => re.test(m.text())) || NO_FILE_PROTOCOL.test(m.text())) return;
		// the harness page has no icon of its own, which Chromium asks the dev server for
		if (m.location().url.endsWith('/favicon.ico')) return;
		errors.push(`console: ${m.text()} ${m.location().url}`);
	});
	try {
		await page.exposeFunction('__harnessWrote', (abs: string, text: string) => {
			if (abs.startsWith(root)) fs.writeFileSync(abs, text);
		});
		await page.goto('/harness/index.html', { waitUntil: 'domcontentloaded', timeout: 180_000 });
		await page.waitForFunction(() => '__harness' in window, undefined, { timeout: 180_000 });
		const { files, binary } = readFolder(root);
		await page.evaluate((load) => (window as unknown as { __harness: { load(o: unknown): void } }).__harness.load(load), {
			root,
			files,
			binary
		});
	} catch (e) {
		await context.close().catch(() => {});
		fs.rmSync(tmp, { recursive: true, force: true });
		throw e;
	}
	return {
		get app(): TexpileWindow['app'] {
			throw new Error('this test drives the Electron app: it has no canvas-web version');
		},
		page,
		root,
		userData,
		takeErrors: () => errors.splice(0),
		async close() {
			await context.close().catch(() => {});
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	};
}
