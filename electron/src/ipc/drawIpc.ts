// the figure engine: a warm lualatex while a figure tab is open
import { luaDir } from '../appIdentity';
import { engineFile, renderPicture, stopDrawing } from '../draw/drawDaemon';
import { handleFs } from './ipcResult';

export function registerDrawIpc(): void {
	handleFs('draw:render', async (body: { root: string; preamble: string; picture: string }) => renderPicture({ ...body, luaDir: luaDir() }));
	handleFs('draw:stop', async () => stopDrawing());
	handleFs('draw:file', async (reported: string) => new Uint8Array(engineFile(reported)));
}
