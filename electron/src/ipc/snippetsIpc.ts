// the global snippet file, under userData so a portable copy keeps it beside the exe
import { app, shell } from 'electron';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { handleFs } from './ipcResult';

const STARTER = `{
	"v": 1,
	"snippets": {
	}
}
`;

function globalPath(): string {
	return join(app.getPath('userData'), 'snippets.json');
}

export function registerSnippetsIpc(): void {
	handleFs('snippets:readGlobal', () => fs.promises.readFile(globalPath(), 'utf8').catch(() => null));
	// made on first use, so there is a file to open
	handleFs('snippets:revealGlobal', async () => {
		const path = globalPath();
		await fs.promises.writeFile(path, STARTER, { flag: 'wx' }).catch(() => {});
		shell.showItemInFolder(path);
		return path;
	});
}
