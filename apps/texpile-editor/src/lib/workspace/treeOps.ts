// file-tree operations (create/rename/delete/move/import/copy/paste): call the provider, refresh the
// tree, toast on failure. the FileTree component is presentational; WorkspaceView wires the deps.
//
// Every mutation here records its own inverse on `history`, which is what makes tree undo possible.
// Rename, move and paste are trivially reversible; delete is the one that needs help, and it works
// the way VS Code's does. Before the entry goes, a copy is made outside the workspace (so nothing
// appears in the user's project), and the original is sent to the OS recycle bin rather than
// unlinked. The copy is what an undo restores from, and because it crosses volumes it is a real
// copy - hence a size limit, above which the delete still happens but is NOT offered as undoable.
//
// A provider without trash support (a guest session) simply removes and records nothing, so undo is
// never offered for something that cannot be reversed.
import { workspaceRoot, activeFilePath, openFile, mainFile } from './workspaceStore';
import { tabs } from './tabs.svelte';
import { docPositions } from './docPositions';
import { visualDocCache } from './visualDocCache';
import { joinPath, dirname, basename, samePath, type TreeEntry } from './fileSystem';
import { createStarterLatex } from './latexRoundtrip';
import { FileHistory } from './fileHistory.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type TreeOpsDeps = {
	create(path: string, type: 'file' | 'dir', content: string): Promise<unknown>;
	remove(path: string): Promise<unknown>;
	rename(from: string, to: string): Promise<unknown>;
	copy(from: string, to: string): Promise<unknown>;
	/** undoable delete: back up (if small enough) then recycle. Absent = no undo at all. */
	trash?(path: string, root: string): Promise<{ backup: string | null; recycled: boolean }>;
	/** put a trashed entry back; must refuse rather than overwrite. */
	restore?(from: string, to: string): Promise<void>;
	/** whether the two above actually work. Lets a caller pass unconditional closures and report
	 *  the capability separately, which is what reading a Svelte prop lazily requires. */
	supportsTrash?(): boolean;
	writeBinary(path: string, file: File): Promise<unknown>;
	stat(path: string): Promise<{ exists: boolean }>;
	refreshTree(): Promise<void>;
	/** refresh citation keys after a new .bib appears. */
	loadRefs(root: string): unknown;
	/** source-mode users write their own preamble (the ghost offers the skeleton); visual gets one up front. */
	wantsStarter(): boolean;
	/** the compile target is Typst: a New Include is a .typ fragment, not a .tex one */
	isTypstProject(): boolean;
	insertIncludeAtCursor(path: string): boolean;
	/** offer to repoint \input/\includegraphics references after a rename/move. */
	afterRename(oldPath: string, newPath: string): void;
	/** a path moved, in ANY direction - user gesture, undo, redo. Unlike afterRename (a prompt,
	 * so user gestures only), this is for state that must follow the file unconditionally:
	 * review-comment threads ride it. */
	afterPathMoved?(oldPath: string, newPath: string): void;
	retargetPendingSave(from: string, to: string): void;
	discardPendingSave(): void;
	/** the main file moved (new path) or was deleted (null): repoint the choice and persist it.
	 * Absent on surfaces without a main-file concept (a guest's session tree). */
	retargetMainFile?(next: string | null): void;
};

export class TreeOps {
	/** undo/redo for the operations below; WorkspaceView binds the tree's Ctrl+Z to it */
	history = new FileHistory();

	constructor(private deps: TreeOpsDeps) {}

	/** true when deletes can be taken back, which is also what gates recording any history at all */
	get undoable(): boolean {
		return this.#canTrash() && !!workspaceRoot.current;
	}

	#canTrash(): boolean {
		if (this.deps.supportsTrash) return this.deps.supportsTrash();
		return !!this.deps.trash && !!this.deps.restore;
	}

	create = async (parentDir: string, name: string, type: 'file' | 'dir' | 'include') => {
		try {
			// an "include" is a fragment that gets referenced from a host doc, so no document skeleton.
			// Its extension follows the compile target: .typ for a Typst project (#include), else .tex (\input).
			const isInclude = type === 'include';
			const includeExt = this.deps.isTypstProject() ? '.typ' : '.tex';
			const finalName = isInclude && !name.toLowerCase().endsWith(includeExt) ? name + includeExt : name;
			const fsType: 'file' | 'dir' = type === 'dir' ? 'dir' : 'file';
			const path = joinPath(parentDir, finalName);
			const isTex = fsType === 'file' && finalName.toLowerCase().endsWith('.tex');
			const content = !isInclude && isTex && this.deps.wantsStarter() ? createStarterLatex() : '';
			await this.deps.create(path, fsType, content);
			// insert the \input into the current doc BEFORE switching away (the switch flushes its save)
			if (isInclude && !this.deps.insertIncludeAtCursor(path)) {
				toaster.error({
					title: m.wsview_toast_include_not_inserted_title(),
					description: m.wsview_toast_include_not_inserted_desc()
				});
			}
			// Only the FILE is recorded. An include also writes an \input line into the open document,
			// and that belongs to the editor's own text undo - taking the file back here deliberately
			// does not reach into a buffer the user may have kept editing since.
			this.#recordAdditions([path], m.filehistory_op_create({ name: finalName }));
			await this.deps.refreshTree();
			if (name.toLowerCase().endsWith('.bib')) await this.deps.loadRefs(workspaceRoot.current ?? parentDir);
			if (isTex) openFile(path);
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
			this.#afterMove(entry.path, to);
			this.#recordMoves([{ from: entry.path, to }], m.filehistory_op_rename({ name: newName }));
			await this.deps.refreshTree();
			this.deps.afterRename(entry.path, to);
		} catch (e) {
			toaster.error({ title: m.wsview_toast_rename_failed_title(), description: e instanceof Error ? e.message : String(e) });
		}
	};

	// drag-and-drop move: a move is a rename to a new directory
	move = async (entry: TreeEntry, targetDir: string, refresh = true) => {
		const to = this.#destIn(targetDir, entry);
		if (!to) return null;
		try {
			await this.deps.rename(entry.path, to);
			this.#afterMove(entry.path, to);
			if (refresh) await this.deps.refreshTree();
			this.deps.afterRename(entry.path, to);
			return { from: entry.path, to };
		} catch (e) {
			toaster.error({ title: m.wsview_toast_move_failed_title(), description: e instanceof Error ? e.message : String(e) });
			return null;
		}
	};

	/** what became of one delete: the pair an undo needs (or null if it could not be backed up),
	 *  and whether the OS took it into its recycle bin. null overall means the delete FAILED. */
	delete = async (
		entry: TreeEntry,
		refresh = true
	): Promise<{ pair: { original: string; trashed: string } | null; recycled: boolean } | null> => {
		try {
			this.#detach(entry.path);
			const { backup, recycled } = await this.#trash(entry.path);
			if (refresh) await this.deps.refreshTree();
			return { pair: backup ? { original: entry.path, trashed: backup } : null, recycled };
		} catch (e) {
			toaster.error({ title: m.wsview_toast_delete_failed_title(), description: e instanceof Error ? e.message : String(e) });
			return null;
		}
	};

	// multi-select fan-out: sequential so each op sees the state the last one left; ONE tree
	// refresh at the end (a full scan per entry made bulk deletes O(n) scans), and ONE history
	// entry, because a selection deleted in one gesture should come back in one too
	deleteMany = async (entries: TreeEntry[]) => {
		const done: { original: string; trashed: string }[] = [];
		let deleted = 0;
		let unrecoverable = 0; // no backup AND no recycle bin: actually gone
		for (const entry of entries) {
			const r = await this.delete(entry, false);
			if (!r) continue;
			deleted++;
			if (r.pair) done.push(r.pair);
			else if (!r.recycled) unrecoverable++;
		}
		// All or nothing. If even one entry was too large to back up, restoring the rest would put
		// the folder in a state the user never had - so undo is withheld for the whole gesture and
		// said so, rather than half-honoured.
		if (done.length && done.length === deleted)
			this.#record(
				entries.length === 1
					? m.filehistory_op_delete_one({ name: entries[0].name })
					: m.filehistory_op_delete_many({ count: done.length }),
				done
			);
		else if (unrecoverable)
			// the only path in the app that destroys something outright: too big to copy, and the OS
			// had no trash to put it in. An error, not a note, and it must not promise a recycle bin
			toaster.error({
				title: unrecoverable === 1 ? m.filehistory_delete_permanent_one() : m.filehistory_delete_permanent_other({ count: unrecoverable }),
				description: m.filehistory_delete_permanent_desc()
			});
		// ...and only when undo was on the table to begin with. A backend that never offers it (a
		// guest session) deletes exactly as it always did, with nothing to explain.
		else if (deleted && this.undoable)
			toaster.info({ title: m.filehistory_delete_too_large(), description: m.filehistory_delete_too_large_desc() });
		await this.deps.refreshTree();
	};

	moveMany = async (entries: TreeEntry[], targetDir: string) => {
		const done: { from: string; to: string }[] = [];
		for (const entry of entries) {
			const r = await this.move(entry, targetDir, false);
			if (r) done.push(r);
		}
		if (done.length)
			this.#recordMoves(
				done,
				entries.length === 1 ? m.filehistory_op_move_one({ name: entries[0].name }) : m.filehistory_op_move_many({ count: done.length })
			);
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
		const written: string[] = [];
		try {
			for (const item of items) {
				const sep = targetDir.includes('\\') ? '\\' : '/';
				const rel = item.relPath.split('/').join(sep);
				// a clashing top-level name gets a numbered variant instead of overwriting;
				// nested paths (folder drops) merge like an OS copy would
				const dest = rel.includes(sep) ? targetDir.replace(/[\\/]+$/, '') + sep + rel : await this.uniqueDest(targetDir, rel);
				await this.deps.writeBinary(dest, item.file);
				written.push(dest);
			}
			toaster.success({
				title:
					written.length === 1
						? m.wsview_toast_imported_one({ count: written.length })
						: m.wsview_toast_imported_other({ count: written.length })
			});
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			// record whatever DID land, even on a partial failure, so a half-finished import is still
			// one keystroke away from being cleaned up
			if (written.length) this.#recordAdditions(written, m.filehistory_op_import({ count: written.length }));
			await this.deps.refreshTree();
		}
	};

	// a tree drag from another Texpile window, or a paste inside this one: recursive fs-side copy
	// (the source window's workspace is left untouched; a cross-window MOVE would go stale under it)
	copyIn = async (paths: string[], targetDir: string) => {
		const written: string[] = [];
		try {
			for (const src of paths) {
				const dest = await this.uniqueDest(targetDir, basename(src));
				await this.deps.copy(src, dest);
				written.push(dest);
			}
			toaster.success({
				title:
					written.length === 1
						? m.wsview_toast_imported_one({ count: written.length })
						: m.wsview_toast_imported_other({ count: written.length })
			});
		} catch (e) {
			toaster.error({ title: m.wsview_toast_import_failed_title(), description: e instanceof Error ? e.message : String(e) });
		} finally {
			if (written.length) this.#recordAdditions(written, m.filehistory_op_paste({ count: written.length }));
			await this.deps.refreshTree();
		}
	};

	// the pieces the operations above share

	/** where `entry` lands inside `targetDir`, or null when that is where it already is. */
	#destIn(targetDir: string, entry: TreeEntry): string | null {
		const sep = entry.path.includes('\\') ? '\\' : '/';
		const to = targetDir.replace(/[\\/]+$/, '') + sep + entry.name;
		return to === entry.path ? null : to;
	}

	/** a path is going away: drop the buffers, tabs and stored caret that pointed at it. */
	#detach(path: string): void {
		const active = activeFilePath.current;
		const sep = path.includes('\\') ? '\\' : '/';
		// the open file is gone if it IS this entry, or lives inside this folder
		if (!!active && (samePath(active, path) || active.startsWith(path + sep))) {
			this.deps.discardPendingSave(); // don't let a queued autosave write the file back after we delete it
			openFile(null); // clears the editor buffers via the load effect
		}
		// deleting the main file clears the choice: a pointer at a deleted path fails every
		// compile lane silently, while a cleared one brings the pick-a-main flow back
		const main = mainFile.current;
		if (main && (samePath(main, path) || main.startsWith(path + sep))) this.deps.retargetMainFile?.(null);
		tabs.closeUnder(path);
		docPositions.forget(path);
		visualDocCache.forget(path);
	}

	/** a path moved: carry the pending save, tab, caret and open-file pointer across with it. */
	#afterMove(from: string, to: string): void {
		this.deps.retargetPendingSave(from, to); // don't let a queued write recreate the old path
		tabs.rename(from, to);
		docPositions.rename(from, to);
		visualDocCache.rename(from, to);
		this.deps.afterPathMoved?.(from, to);
		const active = activeFilePath.current;
		const sep = from.includes('\\') ? '\\' : '/';
		if (active === from) activeFilePath.current = to;
		else if (active && active.startsWith(from + sep)) activeFilePath.current = to + active.slice(from.length);
		// the main-file pointer follows too: compile, draft mode and the typst preview all target
		// it, and a rename that left it on the dead path failed every lane with no way to recover
		// short of re-picking. Covers the file itself and a main inside a renamed folder.
		const main = mainFile.current;
		if (main && samePath(main, from)) this.deps.retargetMainFile?.(to);
		else if (main && main.startsWith(from + sep)) this.deps.retargetMainFile?.(to + main.slice(from.length));
	}

	/** delete one entry, backing it up first when that is possible. */
	async #trash(path: string): Promise<{ backup: string | null; recycled: boolean }> {
		const root = workspaceRoot.current;
		if (!this.#canTrash() || !root) {
			// no undo support at all (a guest session): the old unconditional remove. Reported as
			// recycled so it does not masquerade as the destroyed-outright case, which is about a
			// FAILED trash rather than a backend that never offered one
			await this.deps.remove(path);
			return { backup: null, recycled: true };
		}
		return this.deps.trash!(path, root);
	}

	/**
	 * Record a delete: undo copies each entry back, redo deletes it again.
	 *
	 * The backup path is re-read on every redo rather than reused, because each delete makes a fresh
	 * one - reusing the first would leave a second undo restoring from a slot that has since been
	 * replaced. A redo that cannot back up (the entry grew past the limit in between) keeps the
	 * PREVIOUS backup, which still holds the content this history entry is about.
	 */
	#record(label: string, pairs: { original: string; trashed: string }[]): void {
		if (!this.undoable || !pairs.length) return;
		const live = [...pairs];
		this.history.record({
			label,
			undo: async () => {
				// last-in first-out, so a folder restored before the file it contained cannot collide
				for (const p of [...live].reverse()) await this.deps.restore!(p.trashed, p.original);
				await this.deps.refreshTree();
			},
			redo: async () => {
				for (let i = 0; i < live.length; i++) {
					this.#detach(live[i].original);
					const { backup } = await this.#trash(live[i].original);
					if (backup) live[i] = { ...live[i], trashed: backup };
				}
				await this.deps.refreshTree();
			}
		});
	}

	/** record a rename/move: both directions are the same rename, read the other way round. */
	#recordMoves(pairs: { from: string; to: string }[], label: string): void {
		if (!this.undoable || !pairs.length) return;
		const apply = async (list: { from: string; to: string }[]) => {
			for (const p of list) {
				await this.deps.rename(p.from, p.to);
				this.#afterMove(p.from, p.to);
			}
			await this.deps.refreshTree();
		};
		this.history.record({
			label,
			undo: () => apply([...pairs].reverse().map((p) => ({ from: p.to, to: p.from }))),
			redo: () => apply(pairs)
		});
	}

	/**
	 * Record files that APPEARED - created, pasted, imported. Undo deletes them, redo puts them back.
	 *
	 * Redo restores from the backup rather than repeating the original copy or write: the source of a
	 * paste can be gone by then (another window closed, the OS clipboard moved on), and the bytes of
	 * an import only ever existed in a drop payload.
	 */
	#recordAdditions(paths: string[], label: string): void {
		if (!this.undoable || !paths.length) return;
		let live = paths.map((p) => ({ original: p, trashed: '' }));
		this.history.record({
			label,
			undo: async () => {
				const next: { original: string; trashed: string }[] = [];
				for (const p of live) {
					this.#detach(p.original);
					const { backup } = await this.#trash(p.original);
					// no backup means this one cannot come back; drop it from the redo set rather than
					// leave a path that would fail to restore
					if (backup) next.push({ original: p.original, trashed: backup });
				}
				live = next;
				await this.deps.refreshTree();
			},
			redo: async () => {
				for (const p of [...live].reverse()) await this.deps.restore!(p.trashed, p.original);
				await this.deps.refreshTree();
			}
		});
	}
}
