import { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as fsService from './fs-service';
import * as gitService from './git-service';
import * as draftService from './draft-service';
import * as draftDaemon from './draft-daemon';
import * as updates from './updates';

const isDev = !app.isPackaged;

// display name for menus/notifications and the Linux WM_CLASS (GNOME matches it against the
// .desktop file's StartupWMClass=Texpile; without this the dock shows "Texpile-desktop").
// package.json's `name` also names the settings dir on every existing install, so pin the
// paths BEFORE the rename can move them.
// A dev-channel build (productName ending in "Dev", made with --config.productName="Texpile Dev")
// gets its OWN settings dir and instance lock, so a test exe runs beside the installed Texpile
// without touching its settings or fighting its single-instance lock.
const devChannel = /[ -]dev$/.test(app.getName().toLowerCase());
const dataDirName = devChannel ? 'texpile-desktop-dev' : 'texpile-desktop';
app.setPath('userData', path.join(app.getPath('appData'), dataDirName));
app.setPath('sessionData', path.join(app.getPath('appData'), dataDirName));
app.setName(devChannel ? 'Texpile Dev' : 'Texpile');

// dev/test hook: userData scopes settings, caches, and the single-instance lock,
// so without this a dev run can't start while an installed Texpile is open
if (isDev && process.env.TEXPILE_USER_DATA) {
	app.setPath('userData', process.env.TEXPILE_USER_DATA);
	app.setPath('sessionData', process.env.TEXPILE_USER_DATA);
}

// ---- multi-window registry (one workspace per window, VS Code model) ----
// what each window has open, keyed by webContents id; null = start screen
type WindowRoot = { raw: string; norm: string };
const windowRoots = new Map<number, WindowRoot | null>();
// a file/folder a freshly-created window should open once its renderer loads
type PendingOpen = { kind: 'file' | 'folder'; path: string };
const pendingOpens = new Map<number, PendingOpen>();
// .tex handed over by the OS before any window exists; consumed at whenReady
let initialOpenPath: string | null = null;
// set during shutdown so per-window close cleanup doesn't drain the persisted session
let quitting = false;
// first renderer to ask runs the once-per-session startup work (update check, What's New)
let startupTasksClaimed = false;

// Windows hands out the same folder with varying drive-letter case, so root identity
// must compare case-insensitively there (mirrors the renderer's workspaceStore)
function normRoot(p: string): string {
	const s = path.resolve(p).replace(/[\\/]+$/, '');
	return process.platform === 'win32' ? s.toLowerCase() : s;
}
function windowFor(wcId: number): BrowserWindow | null {
	return BrowserWindow.getAllWindows().find((w) => w.webContents.id === wcId) ?? null;
}
function windowWithRoot(root: string): BrowserWindow | null {
	const n = normRoot(root);
	for (const [wcId, r] of windowRoots) {
		if (r && r.norm === n) {
			const w = windowFor(wcId);
			if (w) return w;
		}
	}
	return null;
}
function focusWindow(w: BrowserWindow): void {
	if (w.isMinimized()) w.restore();
	w.focus();
}
// session restore: settings.openFolders always mirrors the live registry, EXCEPT while
// quitting (or when the last window closes), so the snapshot survives for the next launch
function persistOpenFolders(): void {
	if (quitting) return;
	const roots: string[] = [];
	for (const r of windowRoots.values()) if (r) roots.push(r.raw);
	writeSettings({ openFolders: roots });
}

// GUI launches on macOS/Linux inherit a stripped PATH (no TeX/Homebrew dirs), hiding synctex and
// git. Recover the real PATH from a login shell, reading $PATH between markers so rc noise can't corrupt it.
function fixShellPath(): void {
	if (process.platform === 'win32') return;
	const marker = '__TEXPILE_PATH__';
	try {
		const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
		const out = execFileSync(shell, ['-ilc', `printf '${marker}%s${marker}' "$PATH"`], { encoding: 'utf8', timeout: 5000 });
		const m = out.match(new RegExp(`${marker}(.*)${marker}`));
		if (m && m[1]) process.env.PATH = m[1];
	} catch {
		/* fall back to appending the known dirs below */
	}
	// macOS has fixed TeX/Homebrew dirs worth guaranteeing; Linux TeX Live paths are
	// version-stamped, so the probe is all we have there
	if (process.platform === 'darwin') {
		const dirs = (process.env.PATH || '').split(':').filter(Boolean);
		for (const d of ['/Library/TeX/texbin', '/usr/local/bin', '/opt/homebrew/bin', '/opt/local/bin']) {
			if (!dirs.includes(d)) dirs.push(d);
		}
		process.env.PATH = dirs.join(':');
	}
}
fixShellPath();

// must run before app.whenReady(). `standard` gives real origin semantics (module workers
// need this), `supportFetchAPI` lets pdf.js fetch, `stream` avoids buffering whole PDFs
protocol.registerSchemesAsPrivileged([
	{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
	{ scheme: 'texfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

// a `standard` scheme enforces strict MIME checks on module scripts and worker imports,
// so text/javascript must be exact
const BUNDLE_MIME: Record<string, string> = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.wasm': 'application/wasm',
	'.map': 'application/json',
	'.txt': 'text/plain',
	'.pdf': 'application/pdf',
	'.wav': 'audio/wav'
};

function bundleDir(): string {
	return path.join(process.resourcesPath, 'app-dist');
}

// Draft-mode engine .lua files. Shipped outside the asar via extraResources (see
// electron-builder.yml). In dev, __dirname is electron/dist, so the repo's electron/lua
// is one level up.
function luaDir(): string {
	return isDev ? path.join(__dirname, '..', 'lua') : path.join(process.resourcesPath, 'lua');
}

function registerProtocolHandlers(): void {
	protocol.handle('app', async (request) => {
		const url = new URL(request.url);
		let rel = decodeURIComponent(url.pathname);
		if (rel === '/' || rel === '') rel = '/index.html';
		const root = bundleDir();
		const file = path.normalize(path.join(root, rel));
		// path traversal guard: resolved file must stay inside the bundle
		if (!file.startsWith(root + path.sep) && file !== root) {
			return new Response('Forbidden', { status: 403 });
		}
		try {
			const data = await fs.promises.readFile(file);
			const mime = BUNDLE_MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
			return new Response(new Uint8Array(data), { headers: { 'Content-Type': mime } });
		} catch {
			return new Response('Not found', { status: 404 });
		}
	});

	protocol.handle('texfile', async (request) => {
		const url = new URL(request.url);
		const p = url.searchParams.get('path');
		if (!p) return new Response('Missing path', { status: 400 });
		try {
			const { data, mime } = await fsService.fileBytes(p);
			return new Response(new Uint8Array(data), {
				headers: {
					'Content-Type': mime,
					'Cache-Control': 'no-cache',
					// texfile:// is a different origin than app://bundle, so pdf.js's fetch needs CORS
					'Access-Control-Allow-Origin': '*'
				}
			});
		} catch {
			return new Response('Not found', { status: 404 });
		}
	});
}

function createWindow(url: string, pending?: PendingOpen): BrowserWindow {
	const win = new BrowserWindow({
		width: 1280,
		height: 860,
		// below this the panes clip each other and the toolbar overflows
		minWidth: 900,
		minHeight: 600,
		title: 'Texpile',
		icon: path.join(__dirname, '..', 'icon.png'),
		backgroundColor: '#ffffff',
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			devTools: !app.isPackaged
		}
	});
	// capture now: webContents is gone by the time 'closed' fires
	const wcId = win.webContents.id;
	windowRoots.set(wcId, null);
	if (pending) pendingOpens.set(wcId, pending);
	win.loadURL(url);
	win.webContents.on('did-finish-load', () => {
		// restore the saved whole-window zoom before the first paint the user sees
		const z = Number(readSettings().uiZoom);
		if (Number.isFinite(z) && z > 0) win.webContents.setZoomFactor(z);
		const p = pendingOpens.get(wcId);
		if (p) {
			pendingOpens.delete(wcId);
			win.webContents.send(p.kind === 'file' ? 'main:open-path' : 'main:open-folder', p.path);
		}
	});
	// no native View menu, so wire the DevTools shortcut by hand (dev only). Ctrl+Shift+I only:
	// F12 belongs to the editor's go-to-definition and must reach the renderer
	if (!app.isPackaged) {
		win.webContents.on('before-input-event', (event, input) => {
			if (input.type !== 'keyDown') return;
			const mod = input.control || input.meta;
			if (mod && input.shift && input.key.toLowerCase() === 'i') {
				win.webContents.toggleDevTools();
				event.preventDefault();
			}
		});
	}
	win.webContents.setWindowOpenHandler(({ url: target }) => {
		if (/^https?:/.test(target)) shell.openExternal(target);
		return { action: 'deny' };
	});
	win.on('closed', () => {
		windowRoots.delete(wcId);
		pendingOpens.delete(wcId);
		// the closing window owned the warm engine: stop it so it doesn't hold memory orphaned
		if (draftOwner?.wcId === wcId) {
			draftDaemon.stopDaemon();
			draftOwner = null;
		}
		// last window closing means "quit" on win/linux: keep the snapshot for next launch
		if (BrowserWindow.getAllWindows().length > 0) persistOpenFolders();
	});
	return win;
}

function startUrl(): string {
	if (isDev) return process.env.ELECTRON_START_URL || 'http://localhost:5173';
	return 'app://bundle/index.html';
}

ipcMain.handle('dialog:openFolder', async (e) => {
	const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) ?? undefined!, {
		title: 'Open Folder',
		// createDirectory is macOS-only and off by default: without it NSOpenPanel has no New Folder
		// button, so "create new project" and the tutorial (both of which want an EMPTY folder) were
		// impossible without going to Finder first. Ignored on Windows/Linux, which already allow it.
		properties: ['openDirectory', 'createDirectory']
	});
	return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
});

// failures come back as { ok: false, error } instead of rejecting: a rejected handler makes
// Electron dump a stack trace to the main-process console, and some failures here are routine
type FsResult = { ok: true; value: unknown } | { ok: false; error: string };
function handleFs(channel: string, fn: (...args: never[]) => Promise<unknown>): void {
	ipcMain.handle(channel, async (_e, ...args: unknown[]): Promise<FsResult> => {
		try {
			return { ok: true, value: await (fn as (...a: unknown[]) => Promise<unknown>)(...args) };
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
	});
}
// like handleFs, for handlers that need the sender (dialog parenting, draft-engine ownership)
function handleFsE(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: never[]) => Promise<unknown>): void {
	ipcMain.handle(channel, async (e, ...args: unknown[]): Promise<FsResult> => {
		try {
			return { ok: true, value: await (fn as (e: Electron.IpcMainInvokeEvent, ...a: unknown[]) => Promise<unknown>)(e, ...args) };
		} catch (err) {
			return { ok: false, error: err instanceof Error ? err.message : String(err) };
		}
	});
}
handleFs('fs:scan', fsService.scan);
handleFs('fs:read', fsService.read);
handleFs('fs:write', fsService.write);
handleFs('fs:writeBinary', fsService.writeBinary);
handleFs('fs:tree', fsService.tree);
handleFs('fs:op', fsService.op);
handleFs('fs:search', fsService.search);
handleFs('fs:stat', fsService.statFile);
handleFs('fs:formatLatex', fsService.formatLatex);
handleFs('synctex:call', fsService.synctex);
// One live preview at a time: the warm engine (and its reconcile compiles) belong to one
// window. A second window asking gets a clean 'engine-busy' value instead of silently
// thrashing the daemon between roots; its DraftView offers an explicit takeover.
let draftOwner: { wcId: number; root: string } | null = null;
function draftBusy(e: Electron.IpcMainInvokeEvent, root: string): boolean {
	if (!draftOwner) return false;
	if (draftOwner.wcId === e.sender.id) return false;
	if (normRoot(draftOwner.root) === normRoot(root)) return false;
	if (!windowFor(draftOwner.wcId)) {
		draftOwner = null; // owner window is gone; the engine is free
		return false;
	}
	return true;
}
handleFsE('draft:compile', async (e, body: { root: string; mainFile: string }) => {
	if (draftBusy(e, body.root)) return { ok: false, error: 'engine-busy', ms: 0 };
	draftOwner = { wcId: e.sender.id, root: body.root };
	return draftService.compileDraft({ ...body, engineDir: luaDir() });
});
handleFsE('draft:typeset', async (e, body: { root: string; mainFile: string; text: string; hsize?: number }) => {
	if (draftBusy(e, body.root)) return { ok: false, error: 'engine-busy' };
	draftOwner = { wcId: e.sender.id, root: body.root };
	return draftDaemon.typesetParagraph({ ...body, engineDir: luaDir() });
});
// stop the warm engine when draft mode is switched off / the preview closes, so we don't
// leave an idle lualatex process holding memory for the rest of the session. Only the
// owner may stop it: another window closing its (blocked) preview must not kill ours.
handleFsE('draft:stop', async (e) => {
	if (!draftOwner || draftOwner.wcId === e.sender.id) {
		draftDaemon.stopDaemon();
		draftOwner = null;
	}
	return { ok: true };
});
// explicit user action from the blocked window's DraftView: steal the engine
handleFsE('draft:takeover', async (e, body: { root: string }) => {
	// tell the window LOSING the engine to pause right away; without this it only finds
	// out on its next keystroke and shows a stale "engine ready" state until then
	if (draftOwner && draftOwner.wcId !== e.sender.id) {
		const prev = windowFor(draftOwner.wcId);
		if (prev && !prev.webContents.isDestroyed()) prev.webContents.send('draft:preempted', { root: draftOwner.root });
	}
	draftDaemon.stopDaemon();
	draftOwner = { wcId: e.sender.id, root: body.root };
	return { ok: true };
});
// save the reconcile PDF (the document the live preview mirrors) where the user picks;
// `to` skips the dialog (tests)
handleFsE('draft:savePdf', async (e, body: { root: string; defaultName: string; to?: string }) => {
	const src = path.join(body.root, '_draft', 'draft.pdf');
	if (!fs.existsSync(src)) throw new Error('No compiled PDF yet.');
	let dest = body.to;
	if (!dest) {
		const res = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender) ?? undefined!, {
			title: 'Save PDF',
			defaultPath: path.join(body.root, body.defaultName),
			filters: [{ name: 'PDF', extensions: ['pdf'] }]
		});
		if (res.canceled || !res.filePath) return { saved: false };
		dest = res.filePath;
	}
	fs.copyFileSync(src, dest);
	return { saved: true, path: dest };
});
handleFs('git:status', gitService.gitStatus);
handleFs('git:show', gitService.gitShowHead);
handleFs('git:init', gitService.gitInit);
handleFs('git:stage', gitService.gitStage);
handleFs('git:unstage', gitService.gitUnstage);
handleFs('git:discard', gitService.gitDiscard);
handleFs('git:commit', gitService.gitCommit);

const DEFAULT_SETTINGS = {
	reopenLastFolder: true,
	autosave: true, // off = manual save, warn before switching files
	lastFolder: null as string | null,
	sidebarOpen: true,
	sidebarWidth: 256,
	spellcheck: false,
	dictionary: [] as string[], // spell-check ignore list
	tocFraction: 0.5, // table-of-contents share of the sidebar height (0..1)
	compileCommand: 'latexmk -lualatex -synctex=1 -output-directory=output {main}', // {main} = main file
	compileSentinel: true, // append a marker echo after the compile command to detect completion
	terminalVisible: false,
	terminalHeight: 240,
	pdfPaneWidth: 480,
	pdfPaneOpen: false,
	pdfDarkPages: true, // in dark mode, render PDF pages inverted
	draftMode: false, // preview via the incremental per-page engine instead of the terminal command
	checkForUpdates: true,
	uiZoom: 1, // whole-window zoom factor (webContents.setZoomFactor); the View menu adjusts it
	mathPreview: true, // live math preview tooltip in source mode
	uiLocale: 'en', // UI display language, not the LaTeX document language
	collabRelayUrl: 'wss://collab.texpile.com', // shared-session relay endpoint
	openFolders: [] as string[] // folders open across windows; maintained here for session restore
};
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings(): Record<string, unknown> {
	try {
		return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}
function writeSettings(partial: Record<string, unknown> | undefined): Record<string, unknown> {
	const next = { ...readSettings(), ...(partial || {}) };
	try {
		fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
	} catch (e) {
		console.error('Failed to write settings:', e);
	}
	return next;
}
ipcMain.handle('settings:get', () => readSettings());
ipcMain.handle('settings:set', (_e, partial: Record<string, unknown>) => writeSettings(partial));

// in-app updates; progress/downloaded/error stream back over update:* webContents events
ipcMain.handle('update:check', (_e, manual: boolean) => updates.check(!!manual));
handleFs('update:download', () => updates.download().then(() => ({ ok: true })));
ipcMain.handle('update:install', () => updates.install());
// whole-window zoom: setZoomFactor scales the entire renderer (editor, sidebar, toolbars,
// panels) crisply, unlike a CSS transform. The renderer persists the value in settings.
ipcMain.handle('window:setZoom', (_e, factor: number) => {
	const f = Math.min(2.5, Math.max(0.5, Number(factor) || 1));
	// the persisted uiZoom is app-wide, so keep every window at the same factor
	for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomFactor(f);
	return f;
});

// ---- multi-window IPC ----
// A folder may be open in exactly one window (two autosavers on the same .tex files would
// silently clobber each other). claim() registers the sender as that folder's window; if
// another live window already has it, that window is focused instead and the caller aborts.
ipcMain.handle('workspace:claim', (e, root: string) => {
	const raw = String(root || '');
	if (!raw) return { ok: false, reason: 'bad-root' };
	const norm = normRoot(raw);
	for (const [wcId, r] of windowRoots) {
		if (wcId === e.sender.id || !r || r.norm !== norm) continue;
		const w = windowFor(wcId);
		if (w) {
			focusWindow(w);
			return { ok: false, reason: 'already-open' };
		}
		windowRoots.delete(wcId); // stale entry for a dead window
	}
	windowRoots.set(e.sender.id, { raw, norm });
	persistOpenFolders();
	return { ok: true };
});
ipcMain.handle('workspace:release', (e) => {
	windowRoots.set(e.sender.id, null);
	persistOpenFolders();
	return { ok: true };
});
ipcMain.handle('window:new', () => {
	createWindow(startUrl());
});
// picker + new window in one step, deduped against windows that already have the folder
ipcMain.handle('window:openFolderNew', async (e) => {
	const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) ?? undefined!, {
		title: 'Open Folder',
		properties: ['openDirectory', 'createDirectory']
	});
	if (res.canceled || res.filePaths.length === 0) return null;
	const root = res.filePaths[0]!;
	const existing = windowWithRoot(root);
	if (existing) focusWindow(existing);
	else focusWindow(createWindow(startUrl(), { kind: 'folder', path: root }));
	return root;
});
ipcMain.handle('session:claimStartupTasks', () => {
	if (startupTasksClaimed) return false;
	startupTasksClaimed = true;
	return true;
});

// node-pty is a native module: if it isn't built for this Electron ABI the require throws,
// so guard it and let the renderer show the terminal as unavailable
type Pty = typeof import('node-pty');
type IPty = import('node-pty').IPty;
let pty: Pty | null = null;
try {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	pty = require('node-pty');
} catch (e) {
	console.error('node-pty unavailable, run `pnpm electron:rebuild`:', e instanceof Error ? e.message : e);
}
const ptys = new Map<string, IPty>();

function defaultShell(): string {
	if (process.platform === 'win32') return process.env.COMSPEC || 'powershell.exe';
	// Finder-launched apps may lack SHELL, so fall back to the platform default
	if (process.platform === 'darwin') return process.env.SHELL || '/bin/zsh';
	return process.env.SHELL || '/bin/bash';
}

ipcMain.handle('terminal:available', () => pty != null);

interface TerminalSpawnOpts {
	id?: string;
	cwd?: string;
	cols?: number;
	rows?: number;
}

ipcMain.handle('terminal:spawn', (e, { id, cwd, cols, rows }: TerminalSpawnOpts = {}) => {
	if (!pty) return { ok: false, error: 'node-pty is not built for this Electron build (run `pnpm electron:rebuild`).' };
	if (id == null) return { ok: false, error: 'Missing terminal id' };
	// `shell` tells the renderer which chaining syntax works for its done-sentinel
	// (cmd wants `&`, everything else `;`)
	const shellPath = defaultShell();
	const shell = shellPath.split(/[\\/]/).pop() ?? shellPath;
	if (ptys.has(id)) return { ok: true, shell };
	let proc: IPty;
	try {
		// macOS: login shell, so /etc/zprofile runs path_helper and picks up /etc/paths.d
		// (MacTeX registers /Library/TeX/texbin there). A Finder-launched app only has
		// launchd's bare PATH, and a non-login zsh never repairs it - Terminal.app,
		// iTerm and VS Code all spawn login shells for the same reason.
		proc = pty.spawn(shellPath, process.platform === 'darwin' ? ['-l'] : [], {
			name: 'xterm-color',
			cwd: cwd && fs.existsSync(cwd) ? cwd : app.getPath('home'),
			cols: Math.max(1, cols! | 0) || 80,
			rows: Math.max(1, rows! | 0) || 24,
			env: process.env as Record<string, string>
		});
	} catch (err) {
		return { ok: false, error: String(err instanceof Error ? err.message : err) };
	}
	const wc = e.sender;
	proc.onData((data) => {
		if (!wc.isDestroyed()) wc.send('terminal:data', { id, data });
	});
	proc.onExit(({ exitCode }) => {
		ptys.delete(id);
		if (!wc.isDestroyed()) wc.send('terminal:exit', { id, code: exitCode });
	});
	ptys.set(id, proc);
	return { ok: true, shell };
});

ipcMain.on('terminal:input', (_e, { id, data } = {} as { id?: string; data?: string }) => {
	const p = id != null ? ptys.get(id) : undefined;
	if (p && data != null) p.write(data);
});

ipcMain.on('terminal:resize', (_e, { id, cols, rows } = {} as { id?: string; cols?: number; rows?: number }) => {
	const p = id != null ? ptys.get(id) : undefined;
	if (!p) return;
	try {
		p.resize(Math.max(1, cols! | 0), Math.max(1, rows! | 0));
	} catch {
		/* a resize after exit can throw; ignore */
	}
});

ipcMain.on('terminal:kill', (_e, { id } = {} as { id?: string }) => {
	const p = id != null ? ptys.get(id) : undefined;
	if (!p) return;
	try {
		p.kill();
	} catch {
		/* ignore */
	}
	if (id != null) ptys.delete(id);
});

// OS "Open With": route the file to the window whose workspace contains it, else an
// empty start-screen window, else a fresh window (the VS Code model)
function requestOpenPath(p: string): void {
	if (!p) return;
	const fileNorm = normRoot(p);
	for (const [wcId, r] of windowRoots) {
		if (!r) continue;
		if (fileNorm === r.norm || fileNorm.startsWith(r.norm + path.sep)) {
			const w = windowFor(wcId);
			if (w && !w.webContents.isLoading()) {
				w.webContents.send('main:open-path', p);
				focusWindow(w);
				return;
			}
		}
	}
	for (const [wcId, r] of windowRoots) {
		if (r) continue;
		const w = windowFor(wcId);
		if (!w) continue;
		if (w.webContents.isLoading()) {
			if (!pendingOpens.has(wcId)) {
				pendingOpens.set(wcId, { kind: 'file', path: p });
				focusWindow(w);
				return;
			}
			continue;
		}
		w.webContents.send('main:open-path', p);
		focusWindow(w);
		return;
	}
	if (app.isReady()) focusWindow(createWindow(startUrl(), { kind: 'file', path: p }));
	else initialOpenPath = p;
}

// Windows/Linux file associations put the path in argv; macOS uses the open-file event
function fileFromArgv(argv: string[]): string | null {
	for (const a of argv.slice(1)) {
		if (!a || a.startsWith('-')) continue;
		if (/\.(tex|ltx|latex)$/i.test(a) && fs.existsSync(a)) return path.resolve(a);
	}
	return null;
}

// macOS "Open With" arrives here, possibly before the window (even before ready)
app.on('open-file', (event, filePath) => {
	event.preventDefault();
	requestOpenPath(filePath);
});

// a second launch routes its file to the right window; launching with no file opens a
// fresh window (VS Code model), instead of just focusing the existing one
if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', (_e, argv) => {
		const p = fileFromArgv(argv);
		if (p) requestOpenPath(p);
		else createWindow(startUrl());
	});
}

app.whenReady().then(() => {
	registerProtocolHandlers();
	if (!initialOpenPath) initialOpenPath = fileFromArgv(process.argv);

	// The real menu bar lives in the renderer (WorkspaceMenuBar). On macOS the system bar can't
	// be removed entirely without breaking Cmd+Q and copy/paste in native inputs, so keep ONLY
	// the app menu (Quit/Hide/About) and Edit (undo/cut/copy/paste/selectAll). The old template
	// also carried View and Window, whose items duplicated and drifted out of sync with the
	// in-app menus; those are dropped. Everywhere else the native menu is removed outright.
	if (process.platform === 'darwin') {
		Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }]));
	} else {
		Menu.setApplicationMenu(null);
	}

	if (initialOpenPath) {
		// launched via a .tex file: that request wins over session restore
		createWindow(startUrl(), { kind: 'file', path: initialOpenPath });
		initialOpenPath = null;
	} else {
		// session restore: one window per remembered folder (openFolders), falling back to
		// the pre-multi-window lastFolder slot for existing installs
		const s = readSettings();
		const remembered = Array.isArray(s.openFolders) && s.openFolders.length ? (s.openFolders as string[]) : [];
		const legacy = typeof s.lastFolder === 'string' && s.lastFolder ? [s.lastFolder] : [];
		const folders =
			s.reopenLastFolder !== false
				? [...new Set((remembered.length ? remembered : legacy).map((f) => path.resolve(f)))].filter((f) => {
						try {
							return fs.statSync(f).isDirectory();
						} catch {
							return false;
						}
					})
				: [];
		if (folders.length) for (const f of folders) createWindow(startUrl(), { kind: 'folder', path: f });
		else createWindow(startUrl());
	}

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl());
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
	quitting = true; // freeze the persisted openFolders snapshot before windows start closing
	for (const p of ptys.values()) {
		try {
			p.kill();
		} catch {
			/* ignore */
		}
	}
	ptys.clear();
	draftDaemon.stopDaemon();
});
