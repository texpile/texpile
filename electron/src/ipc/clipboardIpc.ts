// Linux's PRIMARY selection for the canvas editor, which holds no DOM selection for the system to read
import { clipboard, ipcMain } from 'electron';

export function registerClipboardIpc(): void {
	ipcMain.on('clipboard:writeSelection', (_e, text: unknown) => {
		if (typeof text === 'string') void clipboard.selection?.writeText(text);
	});
	ipcMain.handle('clipboard:readSelection', async () => (await clipboard.selection?.readText()) ?? '');
}
