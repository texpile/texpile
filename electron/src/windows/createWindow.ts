// Builds one workspace window: chrome, guards on what it may navigate or open, the held close
// for unsaved edits, and the registry bookkeeping tied to its lifetime.
import { app, BrowserWindow, shell } from 'electron';
import * as path from 'node:path';
import { readSettings } from '../appSettings';
import { isDev } from '../appIdentity';
import { stopWorkspaceWatch } from '../fs/workspaceWatch';
import { forgetWindow } from '../mcp/windowState';
import { forgetWindowChrome, watchWindowState } from '../windowChrome';
import { releaseDraftOwnerFor } from '../ipc/draftIpc';
import { windowRoots, pendingOpens, pendingCloses, isQuitting, cancelQuit, persistOpenFolders, type PendingOpen } from './windowRegistry';

export function chromeColors(): { height: number; color: string; symbolColor: string; background: string } {
	const s = readSettings();
	function hex(v: unknown, fallback: string): string {
		return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
	}
	const h = Number(s.chromeHeight);
	return {
		height: Number.isFinite(h) && h > 0 ? h : 32,
		color: hex(s.chromeColor, '#ffffff'),
		symbolColor: hex(s.chromeSymbolColor, '#000000'),
		background: hex(s.chromeBackground, '#ffffff')
	};
}

export function startUrl(): string {
	if (isDev) return process.env.ELECTRON_START_URL || 'http://127.0.0.1:5173';
	return 'app://bundle/index.html';
}

export function createWindow(url: string, pending?: PendingOpen): BrowserWindow {
	const win = new BrowserWindow({
		width: 1280,
		height: 860,
		// below this the panes clip each other and the toolbar overflows
		// 900 was set when the toolbars could only clip: every bar now collapses into its own "..."
		// instead, so a narrow window stays usable. The floor is the pane layout rather than the
		// chrome now - the sidebar's 180 minimum plus the editor's 360 reserve, plus window frame.
		minWidth: 700,
		minHeight: 600,
		title: 'Texpile',
		icon: path.join(__dirname, '..', 'icon.png'),
		backgroundColor: chromeColors().background,
		// Custom title bar (TitleBar.svelte). Frameless on Windows/Linux so the menus, the app icon
		// and the window buttons share one row instead of costing two - VS Code's layout, and the
		// reason its chrome is a third the height of ours was.
		//
		// macOS keeps a real frame: `hiddenInset` hides the title bar but leaves the traffic lights,
		// the double-click-to-zoom behaviour and the system menu bar, none of which a frameless
		// window can reproduce. There the menus live in the native bar instead (windowChrome.ts).
		//
		// Off macOS the buttons themselves are Chromium's, not ours: titleBarOverlay reserves a strip
		// at the end of our own title bar and draws minimise / maximise / close into it. Two reasons,
		// one per platform. On Linux the button set is a user setting (GNOME's button-layout,
		// gtk-decoration-layout) - which buttons exist and which side they sit on - and nothing in
		// Electron exposes it, so a hand-drawn set is wrong for anyone who changed it, and wrong by
		// default on stock GNOME, which shows close alone. On Windows 11 a real maximise button pops
		// the Snap Layouts picker on hover; buttons we draw ourselves do not, and that is a feature
		// silently missing today. The overlay restores it.
		//
		// The colours come from whatever the renderer last reported (windowOverlay.ts persists them
		// through registerWindowChrome). They cannot be derived here - the theme lives in
		// localStorage, which only the renderer can read - and Chromium paints the overlay before any
		// HTML exists, so without a remembered value the buttons spend the load in a pale strip on a
		// blank window. The light defaults are the genuine first run only.
		...(process.platform === 'darwin'
			? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 10 } }
			: {
					// BOTH, and the pair is load-bearing. `frame: false` alone removes the standard
					// window controls outright, and titleBarOverlay has nothing left to draw - no
					// error, just no buttons. `titleBarStyle: 'hidden'` is what keeps them alive to
					// be overlaid.
					titleBarStyle: 'hidden' as const,
					frame: false,
					titleBarOverlay: {
						height: chromeColors().height,
						color: chromeColors().color,
						symbolColor: chromeColors().symbolColor
					}
				}),
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			// explicit (it IS the default): the preload/bridges must never reach any subframe;
			// the renderer CSP forbids frames entirely (frame-src 'none'), this backs that up
			nodeIntegrationInSubFrames: false,
			// Always available, packaged or not, reached through Help > Toggle Developer Tools. No key
			// binding anywhere: a writer must never open a debugger by fumbling a shortcut mid-sentence.
			devTools: true
		}
	});
	// capture now: webContents is gone by the time 'closed' fires
	const wcId = win.webContents.id;
	watchWindowState(win); // feeds the title bar's maximise / restore state
	windowRoots.set(wcId, null);
	if (pending) pendingOpens.set(wcId, pending);
	win.loadURL(url);
	win.webContents.on('did-finish-load', () => {
		// escape hatch for a wedged renderer, where the in-app View menu can no longer answer
		if (isDev && process.env.TEXPILE_OPEN_DEVTOOLS) win.webContents.openDevTools();
		// restore the saved whole-window zoom before the first paint the user sees
		const z = Number(readSettings().uiZoom);
		if (Number.isFinite(z) && z > 0) win.webContents.setZoomFactor(z);
		const p = pendingOpens.get(wcId);
		if (p) {
			pendingOpens.delete(wcId);
			win.webContents.send(p.kind === 'file' ? 'main:open-path' : 'main:open-folder', p.path);
		}
	});
	// The one window.open the renderer is allowed: the popped-out preview pane, an about:blank
	// child the opener fills by DOM portal (PreviewPopout.svelte). Same-origin about:blank shares
	// the opener's renderer process, which is the whole design - the pane's components keep their
	// stores and sockets. The url check matters: the Typst preview iframe shares this handler, so
	// without it any framed page could mint a window under our name and navigate it anywhere.
	win.webContents.setWindowOpenHandler(({ url: target, frameName }) => {
		if (frameName === 'texpile-preview' && target === 'about:blank') {
			return {
				action: 'allow',
				overrideBrowserWindowOptions: {
					width: 720,
					height: 960,
					minWidth: 360,
					minHeight: 400,
					// a plain framed OS window: the custom title bar machinery stays in the main window
					frame: true,
					titleBarStyle: 'default',
					autoHideMenuBar: true,
					icon: path.join(__dirname, '..', 'icon.png'),
					backgroundColor: chromeColors().background
				}
			};
		}
		if (/^https?:/.test(target)) shell.openExternal(target);
		return { action: 'deny' };
	});
	// the preview popup: same guards as the parent (its top frame is about:blank and must stay
	// that; its only legitimate subframe is the loopback-served Typst page), the saved zoom, and
	// a lifetime bounded by its opener - a preview outliving its workspace previews nothing
	win.webContents.on('did-create-window', (child) => {
		const z = Number(readSettings().uiZoom);
		if (Number.isFinite(z) && z > 0) child.webContents.setZoomFactor(z);
		child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
		child.webContents.on('will-navigate', (e) => e.preventDefault());
		child.webContents.on('will-frame-navigate', (event) => {
			if (event.isMainFrame) return;
			if (/^http:\/\/127\.0\.0\.1:\d+\//.test(event.url)) return;
			event.preventDefault();
		});
		function closeChild(): void {
			if (!child.isDestroyed()) child.close();
		}
		win.on('closed', closeChild);
		child.on('closed', () => win.removeListener('closed', closeChild));
	});
	// the renderer is a single-page app; the top frame must never navigate away from its own origin.
	// http/https go to the real browser, everything else (file:, data:, javascript:, ...) is dropped.
	// Belt-and-braces with the in-editor link handler: a defence against any content-driven navigation.
	win.webContents.on('will-navigate', (event, target) => {
		try {
			if (new URL(target).origin === new URL(win.webContents.getURL()).origin) return; // in-app
		} catch {
			/* unparseable target: fall through and block */
		}
		event.preventDefault();
		if (/^https?:/i.test(target)) shell.openExternal(target);
	});
	// will-navigate covers only the top frame. Subframes get exactly one destination: the Typst
	// preview page we prepared and serve ourselves on loopback. Everything else is blocked
	// wholesale, which backs up the renderer CSP's `frame-src http://127.0.0.1:*` rather than trusting it
	// alone - and, unlike the CSP, this guard also applies in dev, where the renderer is served by
	// Vite and carries no CSP of ours at all.
	win.webContents.on('will-frame-navigate', (event) => {
		if (event.isMainFrame) return;
		if (/^http:\/\/127\.0\.0\.1:\d+\//.test(event.url)) return;
		event.preventDefault();
	});
	// hold the close so the renderer can flush (autosave's 1.5s debounce) or prompt for unsaved
	// edits; the timeout guarantees a hung renderer can never make the window unclosable
	let closeReady = false;
	win.on('close', (e) => {
		if (closeReady) return;
		if (!windowRoots.get(wcId)) return; // no claimed folder (start screen): nothing to flush
		e.preventDefault();
		// already held (double X-click, quit racing a click): keep the FIRST hold's timer — a
		// second arm would orphan it and the orphan force-closes through the renderer's modal
		if (pendingCloses.has(wcId)) return;
		win.webContents.send('app:before-close');
		const t = setTimeout(() => {
			pendingCloses.delete(wcId);
			closeReady = true;
			if (!win.isDestroyed()) win.close();
		}, 2000);
		pendingCloses.set(wcId, {
			settle: (proceed) => {
				clearTimeout(t);
				if (proceed) {
					closeReady = true;
					if (!win.isDestroyed()) win.close();
				} else if (isQuitting()) {
					cancelQuit(); // an aborted quit must un-freeze the openFolders snapshot and re-sync it
				}
			}
		});
	});
	win.on('closed', () => {
		windowRoots.delete(wcId);
		stopWorkspaceWatch(String(wcId));
		pendingOpens.delete(wcId);
		pendingCloses.delete(wcId);
		forgetWindow(wcId); // or a dead window keeps answering get_editor_state
		forgetWindowChrome(wcId); // and hand the macOS menu bar to whichever window is left
		// the closing window may have owned the warm engine: stop it so it doesn't hold memory orphaned
		releaseDraftOwnerFor(wcId);
		// last window closing means "quit" on win/linux: keep the snapshot for next launch
		if (BrowserWindow.getAllWindows().length > 0) persistOpenFolders();
		// the close hold cancelled the original quit; once every window has agreed, finish it
		// (macOS otherwise stays running with quitting latched and a frozen snapshot)
		else if (isQuitting()) app.quit();
	});
	return win;
}
