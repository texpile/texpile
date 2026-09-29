// The history:* surface: Local History (localHistory.ts), kept where VS Code keeps it, in the app's
// own data rather than the project, so it is there for a folder that never had git and never
// travels with the project. A portable copy keeps that data beside the exe (appIdentity.ts), and
// files a project on the same drive by its path from the drive's root, so the history moves with
// the drive.
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { handleFs } from './ipcResult';
import { LocalHistory } from '../localHistory';
import { portable } from '../appIdentity';
import { readSettings } from '../appSettings';
import { appDir } from '../shell/toolDirs';

let history: LocalHistory | null = null;

function store(): LocalHistory {
	return (history ??= new LocalHistory(join(app.getPath('userData'), 'History'), {}, portable ? appDir() : undefined));
}

function path(p: unknown): string {
	if (typeof p !== 'string' || !isAbsolute(p)) throw new Error('Not an absolute path');
	return p;
}

function text(s: unknown, max = Infinity): string {
	if (typeof s !== 'string' || s.length > max) throw new Error('Not a string');
	return s;
}

/** Keep local history, in Preferences, read here too: a window opened before it was turned off
 *  still asks, and a rename's entry is written here, not by the window */
function recording(): boolean {
	return readSettings().localHistory !== false;
}

export function registerLocalHistoryIpc(): void {
	// what the window saved, from the source that saved it; `source` absent for an ordinary save
	handleFs('history:add', async (p: unknown, content: unknown, source?: unknown) =>
		recording() ? store().add(path(p), text(content), source === undefined ? undefined : text(source, 200)) : null
	);
	handleFs('history:list', async (p: unknown) => store().list(path(p)));
	handleFs('history:read', async (p: unknown, id: unknown) => store().read(path(p), text(id, 64)));
	handleFs('history:remove', async (p: unknown, id: unknown) => store().remove(path(p), text(id, 64)));
	handleFs('history:rename', async (p: unknown, id: unknown, label: unknown) => store().rename(path(p), text(id, 64), text(label, 200)));
	handleFs('history:removeAll', async () => store().removeAll());
	// the project's files with history, and whether each is still there
	handleFs('history:all', async (root: unknown) => (await store().all(path(root))).map((f) => ({ ...f, exists: existsSync(f.resource) })));
	// the entries go along either way: turning it off keeps what was kept, which a rename must not strand
	handleFs('history:move', async (from: unknown, to: unknown) => store().move(path(from), path(to), recording()));
	// what Preferences shows beside Clear Local History
	handleFs('history:usage', async () => store().usage());
	// thinning by age and the size cap, a minute after start rather than on every save, and again
	// each day for a window left open
	const prune = () =>
		void store()
			.prune()
			.catch(() => undefined);
	setTimeout(prune, 60_000).unref?.();
	setInterval(prune, 24 * 60 * 60_000).unref?.();
}
