// The multi-window registry (one workspace per window, VS Code model): what each window has
// open, what a fresh window should open once loaded, and which closes are being held.
import { BrowserWindow } from 'electron';
import * as path from 'node:path';
import { writeSettings } from '../appSettings';

/** `file`: a single file open on its own, which is no project: nothing else opens into its window, and it is not remembered */
export type WindowRoot = { raw: string; norm: string; file?: boolean };
export type PendingOpen = { kind: 'file' | 'folder'; path: string };

/** what each window has open, keyed by webContents id: a folder, or a lone file; null = start screen */
export const windowRoots = new Map<number, WindowRoot | null>();
/** a file/folder a freshly-created window should open once its renderer loads */
export const pendingOpens = new Map<number, PendingOpen>();
/** closes held open while the renderer flushes/confirms unsaved edits (see createWindow's close) */
export const pendingCloses = new Map<number, { settle: (proceed: boolean) => void }>();

// set during shutdown so per-window close cleanup doesn't drain the persisted session
let quitting = false;

export function isQuitting(): boolean {
	return quitting;
}
/** freeze the persisted openFolders snapshot before windows start closing */
export function beginQuit(): void {
	quitting = true;
}
/** an aborted quit must un-freeze the openFolders snapshot and re-sync it */
export function cancelQuit(): void {
	quitting = false;
	persistOpenFolders();
}

// Windows hands out the same folder with varying drive-letter case, so root identity
// must compare case-insensitively there (mirrors the renderer's workspaceStore)
export function normRoot(p: string): string {
	const s = path.resolve(p).replace(/[\\/]+$/, '');
	return process.platform === 'win32' ? s.toLowerCase() : s;
}

export function windowFor(wcId: number): BrowserWindow | null {
	return BrowserWindow.getAllWindows().find((w) => w.webContents.id === wcId) ?? null;
}

export function windowWithRoot(root: string): BrowserWindow | null {
	const n = normRoot(root);
	for (const [wcId, r] of windowRoots) {
		if (r && !r.file && r.norm === n) {
			const w = windowFor(wcId);
			if (w) return w;
		}
	}
	return null;
}

/** the folder a window works in; null for a start screen and for a lone file, which has none */
export function folderOf(wcId: number): string | null {
	const r = windowRoots.get(wcId);
	return r && !r.file ? r.raw : null;
}

export function focusWindow(w: BrowserWindow): void {
	if (w.isMinimized()) w.restore();
	w.focus();
}

// session restore: settings.openFolders always mirrors the live registry, EXCEPT while
// quitting (or when the last window closes), so the snapshot survives for the next launch
export function persistOpenFolders(): void {
	if (quitting) return;
	const roots: string[] = [];
	for (const r of windowRoots.values()) if (r && !r.file) roots.push(r.raw);
	writeSettings({ openFolders: roots });
}
