// in-app updates; progress/downloaded/error stream back over update:* webContents events
import { ipcMain } from 'electron';
import * as updates from '../updates/updates';
import { handleFs } from './ipcResult';

export function registerUpdatesIpc(): void {
	ipcMain.handle('update:check', (_e, manual: boolean) => updates.check(!!manual));
	handleFs('update:download', () => updates.download().then(() => ({ ok: true })));
	ipcMain.handle('update:install', () => updates.install());
}
