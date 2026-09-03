// the multi-window surface: folder claims, held closes, new windows, zoom, and the
// once-per-session startup claim
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { startWorkspaceWatch, stopWorkspaceWatch } from '../fs/fsWatch';
import { createWindow, startUrl } from '../windows/createWindow';
import {
	windowRoots,
	pendingOpens,
	pendingCloses,
	normRoot,
	windowFor,
	windowWithRoot,
	focusWindow,
	persistOpenFolders
} from '../windows/windowRegistry';

// first renderer to ask runs the once-per-session startup work (update check, What's New)
let startupTasksClaimed = false;

/** the folder picker, then a window for the folder (or the one that already has it); null when cancelled */
export async function openFolderInNewWindow(from: BrowserWindow | undefined): Promise<string | null> {
	const res = await dialog.showOpenDialog(from!, {
		title: 'Open Folder',
		properties: ['openDirectory', 'createDirectory']
	});
	if (res.canceled || res.filePaths.length === 0) return null;
	const root = res.filePaths[0]!;
	const existing = windowWithRoot(root);
	if (existing) focusWindow(existing);
	else focusWindow(createWindow(startUrl(), { kind: 'folder', path: root }));
	return root;
}

export function registerWorkspaceWindowIpc(): void {
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
		// watch the claimed root so external writes (another editor, git, an AI agent) reach the
		// renderer's conflict machinery now instead of on the next window focus
		const wcId = e.sender.id;
		startWorkspaceWatch(String(wcId), raw, () => windowFor(wcId)?.webContents.send('workspace:fs-changed'));
		return { ok: true };
	});

	ipcMain.handle('workspace:release', (e) => {
		windowRoots.set(e.sender.id, null);
		stopWorkspaceWatch(String(e.sender.id));
		persistOpenFolders();
		return { ok: true };
	});

	ipcMain.on('window:close-decision', (e, proceed: boolean) => {
		const held = pendingCloses.get(e.sender.id);
		pendingCloses.delete(e.sender.id);
		held?.settle(!!proceed);
	});

	ipcMain.handle('window:new', () => {
		createWindow(startUrl());
	});

	// scoped to the sender rather than the focused window: with several workspaces open, the menu
	// that was clicked is the one whose console the user wants
	ipcMain.on('window:toggle-devtools', (e) => e.sender.toggleDevTools());

	// "Reload workspace": a plain renderer reload loses the in-memory workspace root and lands on the
	// start screen, so queue the folder as a pending open first - the same did-finish-load push that
	// session restore uses, which also reopens the last file. The root comes from the window registry,
	// never from the renderer, so a confused renderer cannot talk this into opening an arbitrary path.
	ipcMain.on('window:reload-workspace', (e) => {
		const root = windowRoots.get(e.sender.id);
		if (root) pendingOpens.set(e.sender.id, { kind: 'folder', path: root.raw });
		e.sender.reload();
	});

	// picker + new window in one step, deduped against windows that already have the folder
	ipcMain.handle('window:openFolderNew', (e) => openFolderInNewWindow(BrowserWindow.fromWebContents(e.sender) ?? undefined));

	// whole-window zoom: setZoomFactor scales the entire renderer (editor, sidebar, toolbars,
	// panels) crisply, unlike a CSS transform. The renderer persists the value in settings.
	ipcMain.handle('window:setZoom', (_e, factor: number) => {
		const f = Math.min(2.5, Math.max(0.5, Number(factor) || 1));
		// the persisted uiZoom is app-wide, so keep every window at the same factor
		for (const w of BrowserWindow.getAllWindows()) w.webContents.setZoomFactor(f);
		return f;
	});

	ipcMain.handle('session:claimStartupTasks', () => {
		if (startupTasksClaimed) return false;
		startupTasksClaimed = true;
		return true;
	});
}
