// the user's keybindings.json, under userData beside the global snippets. Registered at launch: the keys apply from
// the first keystroke
import { app, BrowserWindow, ipcMain } from 'electron';
import * as fs from 'node:fs';
import { join } from 'node:path';

const STARTER = `// Keyboard shortcuts over the defaults, in VS Code's format. Preferences › Keyboard Shortcuts writes here too.
[
]
`;

function keybindingsPath(): string {
	return join(app.getPath('userData'), 'keybindings.json');
}

let changedTimer: NodeJS.Timeout | null = null;

function announceChange(): void {
	if (changedTimer) clearTimeout(changedTimer);
	changedTimer = setTimeout(() => {
		for (const w of BrowserWindow.getAllWindows()) w.webContents.send('keybindings:changed');
	}, 100);
}

export function registerKeybindingsIpc(): void {
	ipcMain.handle('keybindings:path', () => keybindingsPath());
	ipcMain.handle('keybindings:ensure', async () => {
		const path = keybindingsPath();
		await fs.promises.writeFile(path, STARTER, { flag: 'wx' }).catch(() => {});
		return path;
	});
	try {
		// outside any workspace, so no workspace watcher sees it change
		fs.watch(app.getPath('userData'), (_event, name) => {
			if (name === 'keybindings.json') announceChange();
		});
	} catch {
		// unwatchable: the file is read again on window focus
	}
}
