// Draft-mode IPC. Every window runs its own live preview; windows on the same folder share its engines, which stop
// once no window's preview wants them.
import * as draftService from '../draft/draftService';
import { teleport, stopTeleports } from '../draft/teleport/teleportService';
import type { ReadBackFiles } from '../draft/draftProducts';
import { luaDir } from '../appIdentity';
import { normRoot } from '../windows/normRoot';
import { handleFsE } from './ipcResult';

// the folder each window's preview runs
const previewRoots = new Map<number, string>();

/** a window's preview closed, or the window did: its folder's engines stop unless another window uses them */
export function releaseDraftFor(wcId: number): void {
	const root = previewRoots.get(wcId);
	if (root === undefined) return;
	previewRoots.delete(wcId);
	if (![...previewRoots.values()].includes(root)) stopTeleports(root);
}

function previewIn(wcId: number, root: string): void {
	const key = normRoot(root);
	if (previewRoots.get(wcId) === key) return;
	releaseDraftFor(wcId);
	previewRoots.set(wcId, key);
}

export function registerDraftIpc(): void {
	handleFsE('draft:compile', async (e, body: { root: string; mainFile: string; readBack: ReadBackFiles }) => {
		previewIn(e.sender.id, body.root);
		return draftService.compileDraft({ ...body, engineDir: luaDir() });
	});
	// `seq` comes back on every page, so the window can tell this edit's pages from an earlier one's
	handleFsE('draft:teleport', async (e, body: { root: string; mainFile: string; file: string; text: string; seq: number }) => {
		previewIn(e.sender.id, body.root);
		const sender = e.sender;
		return teleport(body, (page) => {
			if (!sender.isDestroyed()) sender.send('draft:page', { root: body.root, seq: body.seq, page });
		});
	});
	// draft mode off or the preview closed: no idle lualatex holds memory for the rest of the session
	handleFsE('draft:stop', async (e) => {
		releaseDraftFor(e.sender.id);
		return { ok: true };
	});
}
