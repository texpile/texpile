// the user's themes folder under userData: a theme is a .css there, its fonts and images in a folder of the same name
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as fs from 'node:fs';
import { join } from 'node:path';

export function themesDir(): string {
	return join(app.getPath('userData'), 'themes');
}

export type ThemeFiles = { dir: string; files: string[] };

async function listThemes(): Promise<ThemeFiles> {
	const dir = themesDir();
	const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
	const files = entries
		.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.css') && !e.name.startsWith('.'))
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b));
	return { dir, files };
}

let changedTimer: NodeJS.Timeout | null = null;

function announceChange(): void {
	if (changedTimer) clearTimeout(changedTimer);
	changedTimer = setTimeout(() => {
		for (const w of BrowserWindow.getAllWindows()) w.webContents.send('themes:changed');
	}, 100);
}

function watchThemes(): void {
	try {
		fs.mkdirSync(themesDir(), { recursive: true });
		// recursive, so a theme's own images and fonts reload it too
		fs.watch(themesDir(), { recursive: true }, announceChange);
	} catch {
		// unwatchable: the list is read again whenever Preferences opens
	}
}

export function registerThemesIpc(): void {
	ipcMain.handle('themes:list', () => listThemes());
	ipcMain.handle('themes:open', async () => {
		await fs.promises.mkdir(themesDir(), { recursive: true });
		return shell.openPath(themesDir());
	});
	watchThemes();
}
