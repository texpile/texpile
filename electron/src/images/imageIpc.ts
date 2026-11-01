import { app } from 'electron';
import { join } from 'node:path';
import { handleFs } from '../ipc/ipcResult';
import { keepOriginal, moveOriginals, noteWritten, originalAt, restoreOriginal } from './imageOriginals';

export function followImageMove(from: string, to: string): Promise<void> {
	return moveOriginals(home(), from, to);
}

function home(): string {
	return join(app.getPath('userData'), 'ImageOriginals');
}

export function registerImageIpc(): void {
	handleFs('image:keepOriginal', async (path: string) => keepOriginal(home(), path));
	handleFs('image:noteWritten', async (path: string) => noteWritten(home(), path));
	handleFs('image:originalAt', async (path: string) => originalAt(home(), path));
	handleFs('image:restoreOriginal', async (path: string) => restoreOriginal(home(), path));
}
