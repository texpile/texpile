import { app } from 'electron';
import { join } from 'node:path';
import { handleFs } from '../ipc/ipcResult';
import { readFigure, writeFigure } from './figureStore';

function home(): string {
	return join(app.getPath('userData'), 'Figures');
}

export function registerFigureStoreIpc(): void {
	handleFs('figures:read', async (name: string) => readFigure(home(), name));
	handleFs('figures:write', async (name: string, svg: string) => writeFigure(home(), name, svg));
}
