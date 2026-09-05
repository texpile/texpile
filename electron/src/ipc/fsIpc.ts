// the fs:* surface: file ops, the folder picker, reveal-in-OS, undoable delete, and synctex
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import * as fsService from '../fs/fsService';
import { probe } from '../fs/binaryProbe';
import { scan, tree, treeScan } from '../fs/fsWalk';
import { search } from '../fs/fsSearch';
import { synctex } from '../fs/synctexCli';
import { formatLatex } from '../fs/formatLatex';
import { backupForUndo } from '../fs/undoBackup';
import { handleFs } from './ipcResult';

/**
 * Where a workspace's undo backups live: under the app's OWN data directory, never inside the
 * project. Namespaced per folder so opening one workspace cannot discard the undo history of a
 * folder another window still has open.
 */
function undoDir(root: string): string {
	const key = createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex').slice(0, 16);
	return path.join(app.getPath('userData'), 'undo', key);
}

/** Above this, a delete is not made undoable. The backup is a real copy (it crosses volumes), so
 *  the limit is what stops deleting a build directory from duplicating it first. */
const UNDO_MAX_BYTES = 64 * 1024 * 1024;

export function registerFsIpc(): void {
	ipcMain.handle('dialog:openFolder', async (e) => {
		const res = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender) ?? undefined!, {
			title: 'Open Folder',
			// createDirectory is macOS-only and off by default: without it NSOpenPanel has no New Folder
			// button, so "create new project" and the tutorial (both of which want an EMPTY folder) were
			// impossible without going to Finder first. Ignored on Windows/Linux, which already allow it.
			properties: ['openDirectory', 'createDirectory']
		});
		return res.canceled || res.filePaths.length === 0 ? null : res.filePaths[0];
	});

	handleFs('fs:scan', scan);
	handleFs('fs:read', fsService.read);
	handleFs('fs:probe', probe);
	handleFs('fs:write', fsService.write);
	handleFs('fs:writeBinary', fsService.writeBinary);
	handleFs('fs:tree', tree);
	handleFs('fs:treeScan', treeScan);
	handleFs('fs:op', fsService.applyFileOp);
	handleFs('fs:search', search);
	handleFs('fs:stat', fsService.statFile);
	handleFs('fs:formatLatex', formatLatex);

	// Reveal a file in the OS file manager. showItemInFolder SELECTS the item in a browser window and
	// nothing more - deliberately not shell.openPath, which hands the path to the OS to open with
	// whatever is registered for it, and so would turn a tree row into an execution surface.
	ipcMain.handle('shell:revealItem', (_e, p: string) => {
		if (typeof p !== 'string' || !p) return { ok: false };
		shell.showItemInFolder(p);
		return { ok: true };
	});

	// The undoable delete. Copy the entry somewhere recoverable when it is small enough, then send the
	// original to the OS recycle bin rather than unlinking it - so even a delete too large to undo in
	// the editor is still recoverable by the user from their file manager. A null `backup` is how the
	// renderer learns not to offer undo for this one.
	handleFs('fs:trash', async (body: { path: string; root: string }) => {
		const backup = await backupForUndo(body.path, undoDir(body.root), UNDO_MAX_BYTES);
		let recycled = true;
		try {
			await shell.trashItem(body.path);
		} catch {
			// Network shares, and Linux boxes with no trash implementation, have nowhere to put it. The
			// file still has to go, so it is unlinked - but the caller is TOLD, because "it is in your
			// recycle bin" is the one thing we must not claim when it is not. With no backup either,
			// this is the only path in the app that destroys something outright.
			recycled = false;
			await fsService.applyFileOp({ action: 'delete', path: body.path });
		}
		return { backup, recycled };
	});

	// Drop a folder's backups. Called when that workspace is opened: the undo stack that could reach
	// them is memory-only, so anything left from a previous session is already unreachable.
	handleFs('fs:purgeUndo', async (root: string) => {
		await fsService.applyFileOp({ action: 'delete', path: undoDir(root) });
		return { ok: true };
	});

	handleFs('synctex:call', synctex);
}
