// Draft-mode engine ownership and its IPC. One live preview at a time: the engines belong to one window. A second
// window asking gets a clean 'engine-busy' value instead of silently thrashing the engines between roots; its
// DraftView offers an explicit takeover.
import * as draftService from '../draft/draftService';
import { teleport, stopTeleports } from '../draft/teleport/teleportService';
import type { ReadBackFiles } from '../draft/draftProducts';
import { luaDir } from '../appIdentity';
import { normRoot, windowFor } from '../windows/windowRegistry';
import { handleFsE } from './ipcResult';

let draftOwner: { wcId: number; root: string } | null = null;

function draftBusy(e: Electron.IpcMainInvokeEvent, root: string): boolean {
	if (!draftOwner) return false;
	if (draftOwner.wcId === e.sender.id) return false;
	if (normRoot(draftOwner.root) === normRoot(root)) return false;
	if (!windowFor(draftOwner.wcId)) {
		draftOwner = null; // owner window is gone; the engine is free
		return false;
	}
	return true;
}

/** a closing window that owned the engines takes them down, so they don't hold memory orphaned */
export function releaseDraftOwnerFor(wcId: number): void {
	if (draftOwner?.wcId === wcId) {
		stopTeleports();
		draftOwner = null;
	}
}

export function registerDraftIpc(): void {
	handleFsE('draft:compile', async (e, body: { root: string; mainFile: string; readBack: ReadBackFiles }) => {
		if (draftBusy(e, body.root)) return { ok: false, error: 'engine-busy', ms: 0 };
		draftOwner = { wcId: e.sender.id, root: body.root };
		return draftService.compileDraft({ ...body, engineDir: luaDir() });
	});
	// `seq` comes back on every page, so the window can tell this edit's pages from an earlier one's
	handleFsE('draft:teleport', async (e, body: { root: string; mainFile: string; file: string; text: string; seq: number }) => {
		if (draftBusy(e, body.root)) return { ok: false, reason: 'engine-busy', ms: 0 };
		draftOwner = { wcId: e.sender.id, root: body.root };
		const sender = e.sender;
		return teleport(body, (page) => {
			if (!sender.isDestroyed()) sender.send('draft:page', { root: body.root, seq: body.seq, page });
		});
	});
	// draft mode off or the preview closed: no idle lualatex holds memory for the rest of the session. Only the
	// owner may stop them: another window closing its (blocked) preview must not kill ours.
	handleFsE('draft:stop', async (e) => {
		if (!draftOwner || draftOwner.wcId === e.sender.id) {
			stopTeleports();
			draftOwner = null;
		}
		return { ok: true };
	});
	// explicit user action from the blocked window's DraftView: steal the engines
	handleFsE('draft:takeover', async (e, body: { root: string }) => {
		// the window LOSING the engines pauses right away, instead of showing "engine ready" until its next keystroke
		if (draftOwner && draftOwner.wcId !== e.sender.id) {
			const prev = windowFor(draftOwner.wcId);
			if (prev && !prev.webContents.isDestroyed()) prev.webContents.send('draft:preempted', { root: draftOwner.root });
		}
		stopTeleports();
		draftOwner = { wcId: e.sender.id, root: body.root };
		return { ok: true };
	});
}
