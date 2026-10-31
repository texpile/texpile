// the figure engines: a warm lualatex for TikZ and a warm tinymist for CeTZ, while a figure tab is open
import { app } from 'electron';
import { luaDir } from '../appIdentity';
import { renderCetz, stopCetz } from './cetzEngine';
import { engineFile, renderPicture, stopDrawing } from './drawDaemon';
import { handleFs } from '../ipc/ipcResult';

export function registerDrawIpc(): void {
	handleFs('draw:render', async (body: { root: string; preamble: string; picture: string }) =>
		renderPicture({ ...body, luaDir: luaDir() })
	);
	handleFs('draw:cetz', async (job: string) => renderCetz(app.getPath('userData'), job));
	handleFs('draw:stop', async () => {
		stopDrawing();
		stopCetz();
	});
	handleFs('draw:file', async (reported: string) => new Uint8Array(engineFile(reported)));
}
