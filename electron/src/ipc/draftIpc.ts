// Draft-mode IPC. Every window runs its own live preview; windows on the same folder share its engines, which stop
// once no window's preview wants them.
import type { WebContents } from 'electron';
import * as draftService from '../draft/draftService';
import { teleport, stageAt, stopTeleports } from '../draft/teleport/teleportService';
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

// TeX names a file or a page many times a second: what it named goes to the window ten times a second at most
const NOTES_EVERY_MS = 100;
const NOTES_KEPT = 8;

function progressTo(sender: WebContents, root: string): (at: draftService.DraftProgress) => void {
	let notes: string[] = [];
	let timer: NodeJS.Timeout | null = null;
	function send(at: draftService.DraftProgress): void {
		if (!sender.isDestroyed()) sender.send('draft:progress', { root, ...at });
	}
	function flush(): void {
		timer = null;
		if (notes.length) send({ notes });
		notes = [];
	}
	return (at) => {
		if (!('notes' in at)) {
			if (timer) clearTimeout(timer);
			flush();
			return send(at);
		}
		notes = [...notes, ...at.notes].slice(-NOTES_KEPT);
		timer ??= setTimeout(flush, NOTES_EVERY_MS);
	};
}

export function registerDraftIpc(): void {
	handleFsE('draft:compile', async (e, body: { root: string; mainFile: string; readBack: ReadBackFiles; rest?: boolean }) => {
		previewIn(e.sender.id, body.root);
		return draftService.compileDraft({ ...body, engineDir: luaDir(), progress: progressTo(e.sender, body.root) });
	});
	// `seq` comes back on every page, so the window can tell this edit's pages from an earlier one's
	handleFsE('draft:teleport', async (e, body: { root: string; mainFile: string; file: string; text: string; seq: number }) => {
		previewIn(e.sender.id, body.root);
		const sender = e.sender;
		return teleport(body, (page) => {
			if (!sender.isDestroyed()) sender.send('draft:page', { root: body.root, seq: body.seq, page });
		});
	});
	handleFsE('draft:stage', async (_e, body: { root: string; mainFile: string; file: string; text: string; line: number }) => {
		stageAt(body);
		return { ok: true };
	});
	// draft mode off or the preview closed: no idle lualatex holds memory for the rest of the session
	handleFsE('draft:stop', async (e) => {
		releaseDraftFor(e.sender.id);
		return { ok: true };
	});
}
