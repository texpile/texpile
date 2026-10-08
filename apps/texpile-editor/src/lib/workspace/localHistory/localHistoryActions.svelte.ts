// What Version History does with a copy, as VS Code's local history commands do: show it against the
// file, Restore, Rename, Delete, and Save a Copy Now (VS Code's Create Entry). A module the workspace
// provides while it is open, like scmHandlers.svelte.ts: the panel is drawn apart from the editor it acts on.
import type { HeldFileDeps } from '$lib/buffers/heldFiles';
import {
	addLocalHistory,
	listLocalHistory,
	readLocalHistory,
	removeLocalHistory,
	renameLocalHistory,
	removeAllLocalHistory,
	sourceLabel,
	LOCAL_REF,
	type LocalHistoryEntry
} from './localHistory.svelte';
import { basename, detectEol, fromLf, samePath, toLf } from '../fileSystem';
import { openFile } from '../workspaceStore';
import { promptAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type LocalHistoryDeps = HeldFileDeps & {
	getLoadedPath(): string | null;
	/** write the file's queued autosave now: a restore keeps what it replaces, unsaved edits included */
	flushPendingSave(): Promise<void>;
	/** the queued autosave taken off the queue unwritten (SavePipeline.detach): after a flush, one the
	 *  save guard turned away, which would otherwise land on the restored text later */
	detachPendingSave?(): { path: string; content: string } | null;
	/** resolves once a save already being written has landed, so it cannot land on the restore */
	whenSaved(): Promise<void>;
	/** null when the file is gone */
	readTextIfPresent(path: string): Promise<string | null>;
	writeText(path: string, content: string): Promise<void>;
	/** the open editor takes what is on disk now, as it takes a change made outside the app */
	adoptDisk(path: string): Promise<void>;
	/** how many open suggestions bringing back `after` over `before` rejects (SuggestionsController.droppedBy) */
	suggestionsDropped(path: string, before: string, after: string): Promise<number>;
	/** that restore recorded in the comment log, before the editor takes the text */
	restoreSuggestions(path: string, before: string, after: string): Promise<void>;
	/** a file not open changed on disk: its suggestions take `text` as an open file's do, which reopens the ones a restore
	 *  rejected when the Undo on its notice writes the text back */
	adoptClosed(path: string, text: string): Promise<void>;
	/** `replacing`: the version a comparison of the file is against now, turned to this one in its own tab */
	openCompareTab(path: string, compare: { hash: string; subject: string }, replacing?: string): void;
	/** the comparison against `hash` closed, and the file itself in front */
	leaveCompareTab(path: string, hash: string): void;
};

function restoreRejects(count: number): string {
	return count === 1 ? m.history_restore_rejects_one() : m.history_restore_rejects_other({ count });
}

/** "5 Mar 2026, 14:02": VS Code's local history date label */
export function entryDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export class LocalHistoryActions {
	constructor(private deps: LocalHistoryDeps) {}

	/** Version History on a file: the editor shows what has changed since its newest copy that differs from
	 *  the file, the one that matches showing nothing to bring back */
	async open(path: string): Promise<void> {
		const list = await listLocalHistory(path);
		if (!list.length) {
			toaster.info({ title: m.history_none() });
			return;
		}
		const now = await this.currentText(path);
		for (const e of list) {
			if ((await readLocalHistory(path, e.id)) !== now) return this.show(path, e);
		}
		this.show(path, list[0]);
	}

	/** the editor's comparison turned to `entry`; `replacing`, the copy it shows now */
	show(path: string, entry: LocalHistoryEntry, replacing?: string): void {
		const compare = { hash: `${LOCAL_REF}${entry.id}`, subject: `${sourceLabel(entry.source)} · ${entryDate(entry.timestamp)}` };
		this.deps.openCompareTab(path, compare, replacing);
	}

	/** Back to Editing: the file itself, in place of its comparison with `hash` */
	leave(path: string, hash: string): void {
		this.deps.leaveCompareTab(path, hash);
	}

	/** Restore: asked first, then the file becomes the copy, and that is an entry of its own. What it
	 *  held, unsaved edits included, is kept first as Before Restore, and the notice offers Undo. The
	 *  suggestions it removes are rejected, which the question says and the Undo takes back */
	async restore(path: string, entry: LocalHistoryEntry): Promise<boolean> {
		const content = await readLocalHistory(path, entry.id);
		if (content === null) {
			toaster.error({ title: m.history_restore_failed({ name: basename(path) }), description: m.history_entry_gone() });
			return false;
		}
		const onDisk = await this.deps.readTextIfPresent(path);
		const dropped = onDisk === null ? 0 : await this.deps.suggestionsDropped(path, toLf(onDisk), toLf(content));
		const answer = await promptAsk({
			title: m.history_restore_title(),
			message: m.history_restore_message({ name: basename(path) }),
			detail: [m.history_restore_detail(), dropped ? restoreRejects(dropped) : ''].filter(Boolean).join(' '),
			buttons: [
				{ id: 'restore', label: m.history_restore(), primary: true },
				{ id: 'cancel', label: m.vcs_cancel() }
			],
			cancelId: 'cancel'
		});
		if (answer !== 'restore') return false;
		let current: string | null;
		// samePath: after a rename in the app the editor holds the path with / and Local History hands
		// it back with \ on Windows, and a miss left the queued save to land on the restored text
		const loaded = this.deps.getLoadedPath();
		const open = !!loaded && samePath(loaded, path);
		const held = !open && !!this.deps.heldUnder?.([path]).length;
		try {
			const unsaved = open || held ? await this.settle(open ? null : path) : null;
			await this.deps.whenSaved();
			// the file's own line endings, whatever the copy was kept with
			current = await this.deps.readTextIfPresent(path);
			// what the restore replaces, so restoring is undone the same way
			if (current !== null) await addLocalHistory(path, toLf(current), 'before-restore');
			if (unsaved) await addLocalHistory(unsaved.path, unsaved.content, 'before-restore');
			// in the log before the text lands, which the editor would otherwise take as an edit that withdraws them
			if (current !== null) await this.deps.restoreSuggestions(path, toLf(current), toLf(content));
			await this.deps.writeText(path, current === null ? content : fromLf(toLf(content), detectEol(current)));
		} catch (e) {
			toaster.error({ title: m.history_restore_failed({ name: basename(path) }), description: e instanceof Error ? e.message : String(e) });
			return false;
		}
		// a deleted file comes back (its folder too, if that went), and is opened
		if (current === null) openFile(path);
		else if (open) await this.deps.adoptDisk(path);
		else if (held) await this.deps.catchUpWithDisk?.();
		await addLocalHistory(path, toLf(content), 'restored');
		// said, as restoring a version is: the file may not be the one on screen
		const before = current;
		toaster.success({
			title: m.history_toast_restored({ name: basename(path) }),
			...(before !== null ? { action: { label: m.vcs_undo(), onClick: () => void this.undoRestore(path, before) } } : {})
		});
		return true;
	}

	/** Undo on the notice: the text the file had before, written back, and the suggestions the restore
	 *  rejected open again. Typing since the restore is saved first, and kept as any save is: queued, it
	 *  would land on the text Undo brings back */
	private async undoRestore(path: string, before: string): Promise<void> {
		const loaded = this.deps.getLoadedPath();
		const open = !!loaded && samePath(loaded, path);
		const held = !open && !!this.deps.heldUnder?.([path]).length;
		try {
			const unsaved = open || held ? await this.settle(open ? null : path) : null;
			if (unsaved) await addLocalHistory(unsaved.path, unsaved.content, 'before-restore');
			await this.deps.whenSaved();
			await this.deps.writeText(path, before);
		} catch (e) {
			toaster.error({ title: m.history_restore_failed({ name: basename(path) }), description: e instanceof Error ? e.message : String(e) });
			return;
		}
		if (open) await this.deps.adoptDisk(path);
		else await this.deps.adoptClosed(path, toLf(before));
		if (held) await this.deps.catchUpWithDisk?.();
	}

	/** The open file's queued save written out and waited for. Resolves to one the save guard turned
	 *  away (the file changed outside, and the author put off deciding), taken off the queue: its
	 *  text is on no disk, so the caller keeps it, and queued it would later be written over
	 *  whatever the caller writes */
	private async settle(heldPath: string | null): Promise<{ path: string; content: string } | null> {
		await this.deps.flushPendingSave();
		return heldPath ? (this.deps.takeHeldEdit?.(heldPath) ?? null) : (this.deps.detachPendingSave?.() ?? null);
	}

	/** the file as it is on disk now, in LF as the copies are kept; null when it is gone */
	async currentText(path: string): Promise<string | null> {
		const text = await this.deps.readTextIfPresent(path);
		return text === null ? null : toLf(text);
	}

	/** Rename: the entry's label, which starts as how it was made ("File Saved") */
	async rename(path: string, entry: LocalHistoryEntry, name: string): Promise<void> {
		if (name.trim()) await renameLocalHistory(path, entry.id, name.trim());
	}

	async remove(path: string, entry: LocalHistoryEntry): Promise<void> {
		const answer = await promptAsk({
			message: m.history_delete_message({ name: basename(path), date: entryDate(entry.timestamp) }),
			detail: m.history_irreversible(),
			buttons: [
				{ id: 'delete', label: m.history_delete(), primary: true },
				{ id: 'cancel', label: m.vcs_cancel() }
			],
			cancelId: 'cancel',
			danger: true
		});
		if (answer === 'delete') await removeLocalHistory(path, entry.id);
	}

	/** Delete All: every entry of every file */
	async removeAll(): Promise<void> {
		const answer = await promptAsk({
			message: m.history_delete_all_message(),
			detail: m.history_irreversible(),
			buttons: [
				{ id: 'delete', label: m.history_delete_all(), primary: true },
				{ id: 'cancel', label: m.vcs_cancel() }
			],
			cancelId: 'cancel',
			danger: true
		});
		if (answer === 'delete') await removeAllLocalHistory();
	}

	/** Create Entry: the file as it is on disk now, under a name the author gives it */
	async create(path: string, name: string): Promise<void> {
		if (!name.trim()) return;
		const content = await this.deps.readTextIfPresent(path);
		if (content === null) return;
		if (!(await addLocalHistory(path, toLf(content), name.trim()))) toaster.error({ title: m.history_create_failed() });
	}
}

let current = $state<LocalHistoryActions | null>(null);

export const localHistoryActions = {
	get current(): LocalHistoryActions | null {
		return current;
	}
};

/** the workspace provides them while it is open; the returned function lets go */
export function provideLocalHistoryActions(actions: LocalHistoryActions): () => void {
	current = actions;
	return () => {
		if (current === actions) current = null;
	};
}
