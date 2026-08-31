// Draft-mode engine ownership and its IPC. One live preview at a time: the warm engine (and its
// reconcile compiles) belong to one window. A second window asking gets a clean 'engine-busy'
// value instead of silently thrashing the daemon between roots; its DraftView offers an explicit
// takeover.
import * as draftService from '../draft/draftService';
import * as draftDaemon from '../draft/draftDaemon';
import { stopWarmCompiler } from '../draft/draftWarmCompile';
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

/** a closing window that owned the warm engine takes it down, so it doesn't hold memory orphaned */
export function releaseDraftOwnerFor(wcId: number): void {
	if (draftOwner?.wcId === wcId) {
		draftDaemon.stopDaemon();
		stopWarmCompiler();
		draftOwner = null;
	}
}

export function registerDraftIpc(): void {
	handleFsE('draft:compile', async (e, body: { root: string; mainFile: string }) => {
		if (draftBusy(e, body.root)) return { ok: false, error: 'engine-busy', ms: 0 };
		draftOwner = { wcId: e.sender.id, root: body.root };
		return draftService.compileDraft({ ...body, engineDir: luaDir() });
	});
	handleFsE('draft:typeset', async (e, body: { root: string; mainFile: string; text: string; hsize?: number; splitTo?: number }) => {
		if (draftBusy(e, body.root)) return { ok: false, error: 'engine-busy' };
		draftOwner = { wcId: e.sender.id, root: body.root };
		return draftDaemon.typesetParagraph({ ...body, engineDir: luaDir() });
	});
	handleFsE(
		'draft:skeleton',
		async (e, body: { root: string; mainFile: string; items: draftDaemon.SkeletonItem[]; targetPt: number; capacity?: boolean }) => {
			if (draftBusy(e, body.root)) return { ok: false, error: 'engine-busy' };
			draftOwner = { wcId: e.sender.id, root: body.root };
			return draftDaemon.splitSkeleton({ ...body, engineDir: luaDir() });
		}
	);
	// stop the warm engine when draft mode is switched off / the preview closes, so we don't
	// leave an idle lualatex process holding memory for the rest of the session. Only the
	// owner may stop it: another window closing its (blocked) preview must not kill ours.
	handleFsE('draft:stop', async (e) => {
		if (!draftOwner || draftOwner.wcId === e.sender.id) {
			draftDaemon.stopDaemon();
			stopWarmCompiler();
			draftOwner = null;
		}
		return { ok: true };
	});
	// explicit user action from the blocked window's DraftView: steal the engine
	handleFsE('draft:takeover', async (e, body: { root: string }) => {
		// tell the window LOSING the engine to pause right away; without this it only finds
		// out on its next keystroke and shows a stale "engine ready" state until then
		if (draftOwner && draftOwner.wcId !== e.sender.id) {
			const prev = windowFor(draftOwner.wcId);
			if (prev && !prev.webContents.isDestroyed()) prev.webContents.send('draft:preempted', { root: draftOwner.root });
		}
		draftDaemon.stopDaemon();
		stopWarmCompiler();
		draftOwner = { wcId: e.sender.id, root: body.root };
		return { ok: true };
	});
}
