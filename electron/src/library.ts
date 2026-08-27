// The user's personal bibliography: one library.bib in the app's userData folder, outside any
// project. Read and written whole; the renderer owns parsing and editing. Missing file is the
// first-run state, not an error. The write is temp-file + rename so a crash mid-write can never
// leave a truncated library behind.
import { app, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

function libraryFile(): string {
	return path.join(app.getPath('userData'), 'library.bib');
}

function message(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export function registerLibrary(): void {
	ipcMain.handle('library:read', async () => {
		try {
			return { ok: true, text: fs.readFileSync(libraryFile(), 'utf8') };
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, text: '' };
			return { ok: false, error: message(err) };
		}
	});

	ipcMain.handle('library:write', async (_e, body: { text: string }) => {
		if (typeof body?.text !== 'string') return { ok: false, error: 'nothing to write' };
		try {
			const file = libraryFile();
			const stagingFile = `${file}.tmp`;
			fs.writeFileSync(stagingFile, body.text);
			fs.renameSync(stagingFile, file);
			return { ok: true };
		} catch (err) {
			return { ok: false, error: message(err) };
		}
	});
}
