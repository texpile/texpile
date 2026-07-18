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
app.setPath('userData', path.join(app.getPath('appData'), 'texpile-desktop'));
app.setPath('sessionData', path.join(app.getPath('appData'), 'texpile-desktop'));
app.setName('Texpile');

// dev/test hook: userData scopes settings, caches, and the single-instance lock,
// so without this a dev run can't start while an installed Texpile is open
if (isDev && process.env.TEXPILE_USER_DATA) {
	app.setPath('userData', process.env.TEXPILE_USER_DATA);
	app.setPath('sessionData', process.env.TEXPILE_USER_DATA);
}

let mainWindow: BrowserWindow | null = null;

// .tex handed over by the OS before the window exists; flushed once the renderer loads
let pendingOpenPath: string | null = null;

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

function createWindow(url: string): void {
	mainWindow = new BrowserWindow({
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
	mainWindow.loadURL(url);
	mainWindow.webContents.on('did-finish-load', () => {
		// restore the saved whole-window zoom before the first paint the user sees
		const z = Number(readSettings().uiZoom);
		if (Number.isFinite(z) && z > 0) mainWindow?.webContents.setZoomFactor(z);
		if (pendingOpenPath) {
			mainWindow?.webContents.send('main:open-path', pendingOpenPath);
			pendingOpenPath = null;
		}
	});
	// no native View menu, so wire the DevTools shortcut by hand (dev only). Ctrl+Shift+I only:
	// F12 belongs to the editor's go-to-definition and must reach the renderer
	if (!app.isPackaged) {
		mainWindow.webContents.on('before-input-event', (event, input) => {
			if (input.type !== 'keyDown') return;
			const mod = input.control || input.meta;
			if (mod && input.shift && input.key.toLowerCase() === 'i') {
				mainWindow?.webContents.toggleDevTools();
				event.preventDefault();
			}
		});
	}
	mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
		if (/^https?:/.test(target)) shell.openExternal(target);
		return { action: 'deny' };
	});
	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

function startUrl(): string {
	if (isDev) return process.env.ELECTRON_START_URL || 'http://localhost:5173';
	return 'app://bundle/index.html';
}

ipcMain.handle('dialog:openFolder', async () => {
	const res = await dialog.showOpenDialog(mainWindow ?? undefined!, {
		title: 'Open Folder',
		properties: ['openDirectory']
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
handleFs('draft:compile', (body: { root: string; mainFile: string }) => draftService.compileDraft({ ...body, engineDir: luaDir() }));
handleFs('draft:typeset', (body: { root: string; mainFile: string; text: string; hsize?: number }) =>
	draftDaemon.typesetParagraph({ ...body, engineDir: luaDir() })
);
// stop the warm engine when draft mode is switched off / the preview closes, so we don't
// leave an idle lualatex process holding memory for the rest of the session
handleFs('draft:stop', async () => {
	draftDaemon.stopDaemon();
	return { ok: true };
});
// save the reconcile PDF (the document the live preview mirrors) where the user picks;
// `to` skips the dialog (tests)
handleFs('draft:savePdf', async (body: { root: string; defaultName: string; to?: string }) => {
	const src = path.join(body.root, '_draft', 'draft.pdf');
	if (!fs.existsSync(src)) throw new Error('No compiled PDF yet.');
	let dest = body.to;
	if (!dest) {
		const res = await dialog.showSaveDialog(mainWindow ?? undefined!, {
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
	mathPreview: true // live math preview tooltip in source mode
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
	mainWindow?.webContents.setZoomFactor(f);
	return f;
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

function requestOpenPath(p: string): void {
	if (!p) return;
	if (mainWindow && !mainWindow.webContents.isLoading()) {
		mainWindow.webContents.send('main:open-path', p);
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	} else {
		pendingOpenPath = p;
	}
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

// a second launch (double-clicking another .tex) forwards its file to the running window
if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', (_e, argv) => {
		const p = fileFromArgv(argv);
		if (p) requestOpenPath(p);
		else if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});
}

app.whenReady().then(() => {
	registerProtocolHandlers();
	if (!pendingOpenPath) pendingOpenPath = fileFromArgv(process.argv);

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

	createWindow(startUrl());

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl());
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
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
