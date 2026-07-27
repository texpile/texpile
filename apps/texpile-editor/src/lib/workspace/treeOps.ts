// file-tree operations (create/rename/delete/move/import/copy): call the provider, refresh the
// tree, toast on failure. the FileTree component is presentational; WorkspaceView wires the deps.
import { get } from 'svelte/store';
import { workspaceRoot, activeFilePath } from './workspaceStore';
import { tabs } from './tabs.svelte';
import { joinPath, dirname, basename, samePath, type TreeEntry } from './fileSystem';
import { createStarterLatex } from './latexRoundtrip';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export interface TreeOpsDeps {
	create(path: string, type: 'file' | 'dir', content: string): Promise<unknown>;
	remove(path: string): Promise<unknown>;
	rename(from: string, to: string): Promise<unknown>;
	copy(from: string, to: string): Promise<unknown>;
	writeBinary(path: string, data: File): Promise<unknown>;
	stat(path: string): Promise<{ exists: boolean }>;
	refreshTree(): Promise<void>;
	/** refresh citation keys after a new .bib appears. */
	loadRefs(root: string): unknown;
	/** source-mode users write their own preamble (the ghost offers the skeleton); visual gets one up front. */
	wantsStarter(): boolean;
	insertIncludeAtCursor(path: string): boolean;
	/** offer to repoint \input/\includegraphics references after a rename/move. */
	afterRename(oldPath: string, newPath: string): void;
	retargetPendingSave(from: string, to: string): void;
	discardPendingSave(): void;
}

export class TreeOps {
	constructor(private deps: TreeOpsDeps) {}

	create = async (parentDir: string, name: string, type: 'file' | 'dir' | 'include') => {
		try {
			// an "include" is a .tex fragment: it gets \input into a host doc, so no \documentclass skeleton
			const isInclude = type === 'include';
			if (isInclude && !name.toLowerCase().endsWith('.tex')) name += '.tex';
			const fsType: 'file' | 'dir' = type === 'dir' ? 'dir' : 'file';
			const path = joinPath(parentDir, name);
			const isTex = fsType === 'file' && name.toLowerCase().endsWith('.tex');
			const content = !isInclude && isTex && this.deps.wantsStarter() ? createStarterLatex() : '';
			await this.deps.create(path, fsType, content);
			// insert the \input into the current doc BEFORE switching away (the switch flushes its save)
			if (isInclude && !this.deps.insertIncludeAtCursor(path)) {
				toaster.error({
					title: m.wsview_toast_include_not_inserted_title(),
					description: m.wsview_toast_include_not_inserted_desc()
				});
			}
			await this.deps.refreshTree();
			if (name.toLowerCase().endsWith('.bib')) await this.deps.loadRefs(get(workspaceRoot) ?? parentDir);
			if (isTex) activeFilePath.set(path);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			toaster.error({
				title: m.wsview_toast_create_failed_title(),
				description: msg.includes('EEXIST') ? m.wsview_toast_already_exists({ name }) : msg
			});
		}
	};

	rename = async (entry: TreeEntry, newName: string) => {
		try {
			const to = joinPath(dirname(entry.path), newName);
			await this.deps.rename(entry.path, to);
			this.deps.retargetPendingSave(entry.path, to); // don't let a queued write recreate the old path
			tabs.rename(entry.path, to);
			if (get(activeFilePath) === entry.path) activeFilePath.set(to);
			await this.deps.refreshTree();
			this.deps.afterRename(entry.path, to);
		} catch (e) {
			toaster.error({ title: m.wsview_toast_rename_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	};

	delete = async (entry: TreeEntry, refresh = true) => {
		try {
			const active = get(activeFilePath);
			const sep = entry.path.includes('\\') ? '\\' : '/';
			// the open file is gone if it's the deleted entry, or lives inside a deleted folder
			const closesOpenFile = !!active && (samePath(active, entry.path) || active.startsWith(entry.path + sep));
			if (closesOpenFile) {
				this.deps.discardPendingSave(); // don't let a queued autosave write the file back after we delete it
				activeFilePath.set(null); // clears the editor buffers via the load effect
			}
			tabs.closeUnder(entry.path);
			await this.deps.remove(entry.path);
			if (refresh) await this.deps.refreshTree();
		} catch (e) {
			toaster.error({ title: m.wsview_toast_delete_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	};

	// drag-and-drop move: a move is a rename to a new directory
	move = async (entry: TreeEntry, targetDir: string, refresh = true) => {
		try {
			const sep = entry.path.includes('\\') ? '\\' : '/';
			const to = targetDir.replace(/[\\/]+$/, '') + sep + entry.name;
			if (to === entry.path) return; // already in this folder
			await this.deps.rename(entry.path, to);
			this.deps.retargetPendingSave(entry.path, to); // don't let a queued write recreate the old path
			tabs.rename(entry.path, to);
			// keep the open file pointed at its new location if it (or its folder) moved
			const active = get(activeFilePath);
			if (active === entry.path) activeFilePath.set(to);
			else if (active && active.startsWith(entry.path + sep)) activeFilePath.set(to + active.slice(entry.path.length));
			if (refresh) await this.deps.refreshTree();
			this.deps.afterRename(entry.path, to);
		} catch (e) {
			toaster.error({ title: m.wsview_toast_move_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	};

	// multi-select fan-out: sequential so each op sees the state the last one left; ONE tree
	// refresh at the end (a full scan per entry made bulk deletes O(n) scans)
	deleteMany = async (entries: TreeEntry[]) => {
		for (const entry of entries) await this.delete(entry, false);
		await this.deps.refreshTree();
	};

	moveMany = async (entries: TreeEntry[], targetDir: string) => {
		for (const entry of entries) await this.move(entry, targetDir, false);
		await this.deps.refreshTree();
	};

	/** targetDir + name, numbered (name-1.ext, name-2.ext, ...) until it doesn't collide. */
	private async uniqueDest(targetDir: string, name: string): Promise<string> {
		const sep = targetDir.includes('\\') ? '\\' : '/';
		const base = targetDir.replace(/[\\/]+$/, '') + sep;
		let dest = base + name;
		let n = 0;
		while ((await this.deps.stat(dest)).exists) {
			n++;
			const dot = name.lastIndexOf('.');
			dest = base + (dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`);
		}
		return dest;
	}

	// files dropped from the OS file manager (or pasted from the clipboard) copy into the tree.
	// Bytes come from the drag/clipboard payload, so no OS paths are involved.
	import = async (items: { relPath: string; file: File }[], targetDir: string) => {
		let imported = 0;
		try {
			for (const item of items) {
				const sep = targetDir.includes('\\') ? '\\' : '/';
				const rel = item.relPath.split('/').join(sep);
				// a clashing top-level name gets a numbered variant instead of overwriting;
				// nested paths (folder drops) merge like an OS copy would
				const dest = rel.includes(sep) ? targetDir.replace(/[\\/]+$/, '') + sep + rel : await this.uniqueDest(targetDir, rel);
				await this.deps.writeBinary(dest, item.file);
				imported++;
			}
			toaster.success({
				title: imported === 1 ? m.wsview_toast_imported_one({ count: imported }) : m.wsview_toast_imported_other({ count: imported })
			});
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			await this.deps.refreshTree();
		}
	};

	// a tree drag from another Texpile window: recursive fs-side copy (the source window's
	// workspace is left untouched; a cross-window MOVE would go stale under its feet)
	copyIn = async (paths: string[], targetDir: string) => {
		let copied = 0;
		try {
			for (const src of paths) {
				const dest = await this.uniqueDest(targetDir, basename(src));
				await this.deps.copy(src, dest);
				copied++;
			}
			toaster.success({
				title: copied === 1 ? m.wsview_toast_imported_one({ count: copied }) : m.wsview_toast_imported_other({ count: copied })
			});
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			await this.deps.refreshTree();
		}
	};
}
