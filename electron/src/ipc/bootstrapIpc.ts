// what the renderer needs before its first render, in one sync call from preload
import { ipcMain } from 'electron';
import { readSettings } from '../appSettings';
import { pendingOpens, windowRoots } from '../windows/windowRegistry';

export function registerBootstrapIpc(): void {
	ipcMain.on('window:bootstrap', (e) => {
		const wcId = e.sender.id;
		// consumed here, or did-finish-load pushes the same open a second time
		const pending = pendingOpens.get(wcId) ?? null;
		if (pending) pendingOpens.delete(wcId);
		const root = windowRoots.get(wcId);
		const open = pending ?? (root ? { kind: 'folder' as const, path: root.raw } : null);
		// eslint-disable-next-line no-param-reassign -- returnValue on the event IS how sendSync replies
		e.returnValue = { open, settings: readSettings() };
	});
}
