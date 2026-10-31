// the figure engines: warm lualatex for TikZ and a warm tinymist for CeTZ, while a window's figure tab is open
import { app } from 'electron';
import { luaDir } from '../appIdentity';
import { releaseCetz, renderCetz, restartCetz } from './cetzEngine';
import { engineFile, releaseDrawing, renderPicture, restartDrawing } from './drawDaemon';
import { handleFs, handleFsE } from '../ipc/ipcResult';

// a window that closes lets go of the engines it drew with
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
	handleFsE('draw:cetz', async (e, job: string) => renderCetz(app.getPath('userData'), job, userOf(e)));
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
