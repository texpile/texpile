// Undo/redo for FILE operations - create, rename, move, paste, delete - as distinct from the text
// undo inside an editor. Two separate stacks bound to two different surfaces on purpose: Ctrl+Z in
// the editor is text, Ctrl+Z with the file tree focused is this. Sharing one stack would mean a
// keystroke aimed at a typo could take back a deleted folder, and the reverse.
//
// What makes every entry reversible is that TreeOps no longer unlinks: a delete MOVES the entry
// into the workspace's own trash directory (see fileSystem.trashEntry). The inverse of every
// recorded operation is therefore a move, which costs nothing to hold and can be repeated in both
// directions indefinitely - no file contents are kept in memory, however large the deletion was.
// The one exception is a replace across the folder, which holds each file's text (under 2 MB).
//
// The stacks are memory-only and per-window. They do not survive a reload, which is exactly why the
// trash is purged when a workspace is opened: once the history that could reach those entries is
// gone, they are unreachable, and keeping them would be a leak the user never sees.
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type HistoryEntry = {
	/** already-localized, shown in the menu ("Undo Delete figure.png") and the toast */
	label: string;
	undo(): Promise<void>;
	redo(): Promise<void>;
};

/** Deep enough to cover a session's worth of tree edits, bounded so a long session cannot grow
 *  without limit. Entries are tiny (a few paths and a closure), so this is about tidiness. */
const LIMIT = 50;

export class FileHistory {
	undoStack = $state<HistoryEntry[]>([]);
	redoStack = $state<HistoryEntry[]>([]);
	/** an undo/redo is in flight; the shortcuts and menu items are inert until it settles */
	busy = $state(false);

	get canUndo(): boolean {
		return !this.busy && this.undoStack.length > 0;
	}
	get canRedo(): boolean {
		return !this.busy && this.redoStack.length > 0;
	}
	/** what the next undo would take back, for the menu label; null when there is nothing */
	get undoLabel(): string | null {
		return this.undoStack.at(-1)?.label ?? null;
	}
	get redoLabel(): string | null {
		return this.redoStack.at(-1)?.label ?? null;
	}

	/** record a COMPLETED operation. Clears the redo stack, the way any new edit does. */
	record(entry: HistoryEntry): void {
		this.undoStack = [...this.undoStack, entry].slice(-LIMIT);
		this.redoStack = [];
	}

	async undo(): Promise<void> {
		await this.#step('undo');
	}
	async redo(): Promise<void> {
		await this.#step('redo');
	}

	/**
	 * Both directions are the same move: run the entry, then hand it to the opposite stack.
	 *
	 * A FAILURE leaves the entry where it was, deliberately. The world can move under a recorded
	 * operation - the file was recreated by hand, its folder was deleted, something else now sits at
	 * the old path - and popping it anyway would report an undo that did not happen and leave a redo
	 * for an operation that was never reversed. Left in place, the step stays available for when
	 * whatever is in the way has been cleared.
	 */
	async #step(dir: 'undo' | 'redo'): Promise<void> {
		const from = dir === 'undo' ? this.undoStack : this.redoStack;
		if (this.busy || !from.length) return;
		const entry = from[from.length - 1];
		this.busy = true;
		try {
			await entry[dir]();
			if (dir === 'undo') {
				this.undoStack = this.undoStack.slice(0, -1);
				this.redoStack = [...this.redoStack, entry];
			} else {
				this.redoStack = this.redoStack.slice(0, -1);
				this.undoStack = [...this.undoStack, entry];
			}
			toaster.success({
				title: dir === 'undo' ? m.filehistory_undone({ what: entry.label }) : m.filehistory_redone({ what: entry.label })
			});
		} catch (e) {
			toaster.error({
				title: dir === 'undo' ? m.filehistory_undo_failed() : m.filehistory_redo_failed(),
				description: e instanceof Error ? e.message : String(e)
			});
		} finally {
			this.busy = false;
		}
	}

	/** drop everything: the recorded paths are absolute, so they mean nothing in another folder. */
	clear(): void {
		this.undoStack = [];
		this.redoStack = [];
	}
}
