// tinymist resolution and the per-window language server lifecycle.
// One language server per window: each window has its own folder, and tinymist's project model is
// rooted at one workspace. Keyed by webContents id so closing one window can't kill another's.
import { app, ipcMain, webContents } from 'electron';
import * as typstService from '../typstService';

/** each window's server, and the tinymist it was started from */
const typstLsps = new Map<number, { handle: typstService.LspHandle; command: string }>();

function stopLsp(wcId: number): void {
	typstLsps.get(wcId)?.handle.stop();
	typstLsps.delete(wcId);
}

/**
 * Run `change` with every server started from `command` stopped, then tell those windows their
 * server is gone, the way a crash does, so each starts its next one from whatever `command` now is.
 *
 * The stop comes first because Windows will not let a running program be replaced, and the news
 * last because a window told early would restart from the old copy, or from none.
 */
export async function whileTypstLspsStopped<T>(command: string, change: () => Promise<T>): Promise<T> {
	const stopped = [...typstLsps].filter(([, lsp]) => lsp.command === command).map(([wcId]) => wcId);
	for (const wcId of stopped) stopLsp(wcId);
	try {
		return await change();
	} finally {
		for (const wcId of stopped) {
			const wc = webContents.fromId(wcId);
			if (wc && !wc.isDestroyed()) wc.send('typst:lsp:exit', null);
		}
	}
}

export function registerTypstIpc(): void {
	ipcMain.handle('typst:resolve', () => typstService.resolveTinymist(app.getPath('userData')));

	ipcMain.handle('typst:lsp:start', async (e, root: string | null) => {
		const wcId = e.sender.id;
		stopLsp(wcId);
		const resolved = await typstService.resolveTinymist(app.getPath('userData'));
		if (!resolved) return { ok: false, error: 'tinymist was not found on PATH.' };
		try {
			// tinymist logs to stderr; keep a short tail so an unexpected death says why it died
			// (otherwise the only symptom is the preview pane's port going dead)
			const stderrTail: string[] = [];
			const handle = typstService.startLsp(resolved.command, root, {
				message: (json) => {
					if (!e.sender.isDestroyed()) e.sender.send('typst:lsp:message', json);
				},
				exit: (code) => {
					console.error(`[tinymist] exited unexpectedly (code ${code}); last stderr:\n${stderrTail.join('')}`);
					typstLsps.delete(wcId);
					if (!e.sender.isDestroyed()) e.sender.send('typst:lsp:exit', code);
				},
				log: (line) => {
					stderrTail.push(line);
					while (stderrTail.length > 40) stderrTail.shift();
				}
			});
			typstLsps.set(wcId, { handle, command: resolved.command });
			// a closed window can no longer release its own server, and the process holds ~90MB
			e.sender.once('destroyed', () => stopLsp(wcId));
			// eslint-disable-next-line id-denylist -- `info` is the reply's wire field name
			return { ok: true, info: resolved };
		} catch (err) {
			return { ok: false, error: String(err instanceof Error ? err.message : err) };
		}
	});

	ipcMain.on('typst:lsp:send', (e, json: string) => typstLsps.get(e.sender.id)?.handle.send(json));
	ipcMain.on('typst:lsp:stop', (e) => stopLsp(e.sender.id));
}
