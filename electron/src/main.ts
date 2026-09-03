// The composition root: pins the app identity, registers every IPC surface, and owns the
// launch/open/quit lifecycle. Each domain lives in its own module (ipc/, windows/, fs/, ...).
import { app, BrowserWindow, dialog } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { applyAppIdentity } from './appIdentity';
import { shellEnvReady } from './shell/shellEnv';
import { registerPrivilegedSchemes, registerProtocolHandlers } from './appProtocols';
import { readSettings, writeSettings, registerSettingsIpc } from './appSettings';
import { createWindow, startUrl } from './windows/createWindow';
import { windowRoots, pendingOpens, normRoot, windowFor, focusWindow, beginQuit } from './windows/windowRegistry';
import { registerBootstrapIpc } from './ipc/bootstrapIpc';
import { registerFsIpc } from './ipc/fsIpc';
import { registerDraftIpc } from './ipc/draftIpc';
import { registerWorkspaceWindowIpc, openFolderInNewWindow } from './ipc/workspaceWindowIpc';
import { registerSurfacesIpc } from './ipc/surfacesIpc';
import { registerDeferredIpc, shutdownDeferred } from './ipc/deferredIpc';
import { registerWindowChrome } from './windowChrome';

applyAppIdentity();
registerPrivilegedSchemes();

// only what a window needs before it can paint; the rest is in deferredIpc
registerSettingsIpc();
// before every other surface: preload calls it synchronously while the window is still loading
registerBootstrapIpc();
registerFsIpc();
registerDraftIpc();
registerWorkspaceWindowIpc();
registerSurfacesIpc();

// .tex handed over by the OS before any window exists; consumed at whenReady
let initialOpenPath: string | null = null;

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

// texpile://join#CODE handed over before any window exists; consumed at whenReady
let initialJoinLink: string | null = null;

// no "right" window, unlike a .tex; the renderer pulls the code out of the URL itself
function requestJoinSession(url: string): void {
	if (!url) return;
	if (!app.isReady()) {
		initialJoinLink = url;
		return;
	}
	// rootless only: joining navigates to /session, which would throw away an open workspace
	for (const [wcId, r] of windowRoots) {
		if (r) continue;
		const w = windowFor(wcId);
		if (!w || w.webContents.isLoading()) continue;
		w.webContents.send('main:join-session', url);
		focusWindow(w);
		return;
	}
	const w = createWindow(startUrl());
	// preload buffers the channel, so this cannot lose the race against the renderer subscribing
	w.webContents.once('did-finish-load', () => w.webContents.send('main:join-session', url));
	focusWindow(w);
}

function linkFromArgv(argv: string[]): string | null {
	for (const a of argv.slice(1)) if (a && /^texpile:\/\//i.test(a)) return a;
	return null;
}

// Windows/Linux file associations put the path in argv; macOS uses the open-file event
function fileFromArgv(argv: string[]): string | null {
	for (const a of argv.slice(1)) {
		if (!a || a.startsWith('-')) continue;
		// wider than Windows declares: Linux advertises more, and anyone can associate by hand
		if (/\.(tex|ltx|latex|typ|bib|sty|cls|tikz)$/i.test(a) && fs.existsSync(a)) return path.resolve(a);
	}
	return null;
}

// `texpile .` from a shell. Not advertised and nothing puts us on PATH, but the deb already
// does, so a Linux user can type it today - and used to get an empty start screen. The app
// path is skipped because a dev run carries it in argv and it is a directory too.
function folderFromArgv(argv: string[]): string | null {
	const self = path.resolve(app.getAppPath());
	for (const a of argv.slice(1)) {
		if (!a || a.startsWith('-')) continue;
		const full = path.resolve(a);
		if (full === self) continue;
		try {
			if (fs.statSync(full).isDirectory()) return full;
		} catch {
			/* not a path we can see */
		}
	}
	return null;
}

// macOS "Open With" arrives here, possibly before the window (even before ready)
app.on('open-file', (event, filePath) => {
	event.preventDefault();
	requestOpenPath(filePath);
});

// macOS delivers texpile:// here, possibly before the app is ready
app.on('open-url', (event, url) => {
	event.preventDefault();
	requestJoinSession(url);
});

// a second launch routes its file to the right window; launching with no file opens a
// fresh window (VS Code model), instead of just focusing the existing one
if (!app.requestSingleInstanceLock()) {
	app.quit();
} else {
	app.on('second-instance', (_e, argv) => {
		const link = linkFromArgv(argv);
		if (link) {
			requestJoinSession(link);
			return;
		}
		const p = fileFromArgv(argv);
		if (p) {
			requestOpenPath(p);
			return;
		}
		const dir = folderFromArgv(argv);
		createWindow(startUrl(), dir ? { kind: 'folder', path: dir } : undefined);
	});
}

app.whenReady().then(() => {
	registerProtocolHandlers();
	// installed builds only; a dev run registers the electron binary instead
	app.setAsDefaultProtocolClient('texpile');
	if (!initialOpenPath) initialOpenPath = fileFromArgv(process.argv);
	if (!initialJoinLink) initialJoinLink = linkFromArgv(process.argv);
	const argvFolder = folderFromArgv(process.argv);

	// Window controls for the custom title bar, plus - on macOS - the native menu bar, built from
	// what the renderer reports about its own menus. Everywhere else the native menu is removed
	// and the renderer draws it. See windowChrome.ts.
	// persisted so the NEXT launch can paint its window buttons in the right colours before a
	// renderer exists to report them; see chromeColors()
	registerWindowChrome(
		(c) =>
			writeSettings({
				chromeHeight: c.height,
				chromeColor: c.color,
				chromeSymbolColor: c.symbolColor,
				chromeBackground: c.background
			}),
		// the start screen's File menu; the renderer's own open-folder push handles the result
		{
			openFolder: async (win) => {
				const res = await dialog.showOpenDialog(win, { title: 'Open Folder', properties: ['openDirectory', 'createDirectory'] });
				if (!res.canceled && res.filePaths[0]) win.webContents.send('main:open-folder', res.filePaths[0]);
			},
			newWindow: () => focusWindow(createWindow(startUrl())),
			openFolderNewWindow: async (win) => void (await openFolderInNewWindow(win))
		}
	);

	if (initialJoinLink) {
		// wins over session restore, same as a .tex
		const link = initialJoinLink;
		initialJoinLink = null;
		const w = createWindow(startUrl());
		w.webContents.once('did-finish-load', () => w.webContents.send('main:join-session', link));
	} else if (initialOpenPath) {
		// launched via a .tex file: that request wins over session restore
		createWindow(startUrl(), { kind: 'file', path: initialOpenPath });
		initialOpenPath = null;
	} else if (argvFolder) {
		createWindow(startUrl(), { kind: 'folder', path: argvFolder });
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

	// warmed here, not at module scope: the login shell it spawns is slower than the whole launch
	void shellEnvReady();

	// Not before the renderer has been served its own bundle. The app:// handler runs on this
	// thread, so evaluating these any earlier stalls the very requests the first paint waits on -
	// measured at 31ms added to index.html alone. The timer is the backstop for a load that never
	// finishes; nothing here may depend on a healthy renderer.
	BrowserWindow.getAllWindows()[0]?.webContents.once('did-finish-load', () => void registerDeferredIpc());
	setTimeout(() => void registerDeferredIpc(), 3000);

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow(startUrl());
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
	beginQuit(); // freeze the persisted openFolders snapshot before windows start closing
});

// destructive teardown only once the quit is actually happening: the unsaved-edit hold can
// CANCEL a quit, and a cancelled quit must not have killed every shell and the warm engine
app.on('will-quit', () => {
	shutdownDeferred();
});
