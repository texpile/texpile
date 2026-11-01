import { app } from 'electron';
import { luaDir } from '../appIdentity';
import { releaseCetz, renderCetz, restartCetz } from './cetzEngine';
import { engineFile, releaseDrawing, renderPicture, restartDrawing } from './drawDaemon';
import { handleFs, handleFsE } from '../ipc/ipcResult';

const watched = new Set<number>();
function userOf(e: Electron.IpcMainInvokeEvent): number {
	const id = e.sender.id;
	if (!watched.has(id)) {
		watched.add(id);
		e.sender.once('destroyed', () => {
			watched.delete(id);
			releaseDrawing(id);
			releaseCetz(id);
		});
	}
	return id;
}

export function registerDrawIpc(): void {
	handleFsE('draw:render', async (e, body: { root: string; preamble: string; picture: string }) =>
		renderPicture({ ...body, luaDir: luaDir() }, userOf(e))
	);
	handleFsE('draw:cetz', async (e, body: { root: string; path: string; job: string }) =>
		renderCetz(app.getPath('userData'), body, userOf(e))
	);
	handleFsE('draw:stop', async (e) => {
		releaseDrawing(e.sender.id);
		releaseCetz(e.sender.id);
	});
	handleFsE('draw:restart', async (e) => {
		restartDrawing(e.sender.id);
		restartCetz(e.sender.id);
	});
	handleFs('draw:file', async (reported: string) => new Uint8Array(engineFile(reported)));
}
