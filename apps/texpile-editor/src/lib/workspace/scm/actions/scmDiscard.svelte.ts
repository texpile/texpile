// Throwing changes away from the Source Control list. Tracked files go back to the last version;
// a file that was never saved as a version goes to the Trash, not away for good: a new chapter is
// the one thing in this panel git cannot give back. Where there is no Trash (some Linux desktops,
// network shares) the author is asked before anything is deleted outright, as VS Code asks.
// Either way each file's text is kept in Local History first, and the notice after offers Undo:
// Discard is the one button in the panel that throws away work nothing else has a copy of.
import { workspaceRoot } from '../../workspaceStore';
import { refreshGitStatus, isNewFile } from '../gitStore';
import { gitDiscard, gitUnstage, type GitStatusEntry } from '../git';
import { toastGitFailure } from '../gitFailureToast';
import { localGitReason } from '../gitLocalReason';
import { basename, relativeInside, samePath, toLf } from '../../fileSystem';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { addLocalHistory } from '../../localHistory/localHistory.svelte';
import { settings } from '$lib/settings';
import { m } from '$lib/paraglide/messages';
import type { ScmDeps } from './scmActions.svelte';

type DiscardDeps = Pick<
	ScmDeps,
	| 'getLoadedPath'
	| 'discardPendingSave'
	| 'hasPendingSave'
	| 'flushPendingSave'
	| 'detachPendingSave'
	| 'trashEntry'
	| 'removeEntry'
	| 'refreshTree'
	| 'loadFile'
	| 'isDiffMode'
	| 'captureDiffSnapshot'
	| 'readTextIfPresent'
	| 'writeText'
>;

/** VS Code's question: what is about to happen, and under it what follows from it */
function question(changes: GitStatusEntry[], allNew: boolean): { message: string; detail: string } {
	const one = changes.length === 1;
	const name = basename(changes[0].path);
	if (allNew)
		return one
			? { message: m.vcs_confirm_trash_one({ name }), detail: m.vcs_confirm_trash_one_detail() }
			: { message: m.vcs_confirm_trash_other({ count: changes.length }), detail: m.vcs_confirm_trash_other_detail() };
	return {
		message: one ? m.wsview_confirm_discard_one({ name }) : m.wsview_confirm_discard_other({ count: changes.length }),
		// said only when it is so: with Local History off nothing keeps them
		detail: settings.current.localHistory === false ? m.history_irreversible() : m.vcs_discard_kept_detail()
	};
}

export class ScmDiscard {
	constructor(
		private host: { busy: boolean },
		private deps: DiscardDeps
	) {}

	run = async (asked: GitStatusEntry[]): Promise<void> => {
		const root = workspaceRoot.current;
		// a folder that also holds ignored files is never deleted whole: that would take them too
		const changes = asked.filter((c) => !c.ignoredInside);
		// never in the middle of a save or a sync: the files it is about to put back are in flight
		if (!root || !changes.length || this.host.busy) return;
		// the question says which of the two will happen
		const allNew = changes.every(isNewFile);
		const confirmLabel = allNew ? m.vcs_move_to_trash() : m.vcs_discard_changes();
		const ask = question(changes, allNew);
		if (!(await confirmAsk(ask.message, { detail: ask.detail, confirmLabel, danger: true }))) return;
		const loadedPath = this.deps.getLoadedPath();
		// samePath: git and the file tree hand back separators and case that do not always match, and
		// a miss here leaves the editor showing content that is no longer on disk
		// A folder row (a big new folder, shown as one) takes the open file with it when it is inside
		const openAffected =
			!!loadedPath && changes.some((c) => samePath(c.path, loadedPath) || (!!c.files && !!relativeInside(c.path, loadedPath)));
		// if the open file is being discarded, its queued autosave is written out first and waited for:
		// its unsaved edits are then in the copy kept below, as the question said they would be, and a
		// debounced write cannot land after git reverts and re-create the changes. One the save guard
		// turned away (the file changed outside) is still queued after the flush: it is kept as a copy
		// of its own, then dropped
		if (openAffected) {
			if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
			const refused = this.deps.hasPendingSave() ? (this.deps.detachPendingSave?.() ?? null) : null;
			if (refused) await addLocalHistory(refused.path, toLf(refused.content), 'before-discard');
			this.deps.discardPendingSave();
		}
		const kept = await this.#keep(changes);
		this.host.busy = true;
		let err: string | undefined;
		try {
			err = await this.#throwAway(root, changes);
		} finally {
			this.host.busy = false;
		}
		if (err) toastGitFailure(m.wsview_toast_discard_failed_title(), localGitReason(err), { error: err });
		else if (kept.length)
			toaster.success({
				title:
					changes.length === 1
						? m.vcs_toast_discarded_one({ name: basename(changes[0].path) })
						: m.vcs_toast_discarded_other({ count: changes.length }),
				action: { label: m.vcs_undo(), onClick: () => void this.#undo(root, kept) }
			});
		await this.deps.refreshTree();
		await refreshGitStatus(root);
		if (openAffected && loadedPath) await this.deps.loadFile(loadedPath); // its on-disk content changed
		// an open comparison was computed against the changes just thrown away, and went on showing
		// them as additions and deletions that no longer exist anywhere
		if (this.deps.isDiffMode()) this.deps.captureDiffSnapshot();
	};

	/** Each file's text as it is now, into Local History and kept here for Undo. Not a folder of
	 *  new files (one row for many; they go to the Trash whole), nor a file already deleted. */
	async #keep(changes: GitStatusEntry[]): Promise<{ path: string; content: string }[]> {
		const kept: { path: string; content: string }[] = [];
		for (const c of changes) {
			if (c.files) continue;
			const content = await this.deps.readTextIfPresent(c.path).catch(() => null);
			if (content === null) continue;
			// in LF, as saves are kept; Undo writes it back as it was
			await addLocalHistory(c.path, toLf(content), 'before-discard');
			kept.push({ path: c.path, content });
		}
		return kept;
	}

	/** Undo on the notice: the text written back as it was, the open file reloaded to show it. Typing
	 *  since the discard is saved first, and kept as any save is: queued, it would land on the text
	 *  Undo brings back */
	async #undo(root: string, kept: { path: string; content: string }[]): Promise<void> {
		const loaded = this.deps.getLoadedPath();
		const open = !!loaded && kept.some((k) => samePath(k.path, loaded));
		if (open) {
			if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
			this.deps.discardPendingSave();
		}
		for (const k of kept) {
			try {
				await this.deps.writeText(k.path, k.content);
			} catch (e) {
				toastGitFailure(m.wsview_toast_discard_failed_title(), e instanceof Error ? e.message : String(e), {});
				return;
			}
		}
		await this.deps.refreshTree();
		await refreshGitStatus(root);
		if (open && loaded) await this.deps.loadFile(loaded);
	}

	/** the work itself; resolves to the last failure's words, if any */
	async #throwAway(root: string, changes: GitStatusEntry[]): Promise<string | undefined> {
		// new files go to the Trash; tracked files go back to the last version. A rename is both: the
		// new name is a new file, and the old one comes back.
		const fresh = changes.filter((c) => isNewFile(c) || c.from);
		const tracked = [...changes.filter((c) => !isNewFile(c) && !c.from).map((c) => c.path), ...fresh.flatMap((c) => c.from ?? [])];
		let err: string | undefined;
		// one staged as added (in a terminal, or by a save that stopped half-way) is let go of first
		const staged = fresh.filter((c) => c.x !== '?').map((c) => c.path);
		if (staged.length) {
			const res = await gitUnstage(root, staged);
			if (!res.ok) err = res.error;
		}
		const kept: string[] = [];
		for (const c of fresh) {
			try {
				if ((await this.deps.trashEntry(c.path)) === 'kept') kept.push(c.path);
			} catch (e) {
				err = e instanceof Error ? e.message : String(e);
			}
		}
		if (kept.length && (await this.#deleteOutright(kept))) {
			for (const p of kept) {
				try {
					await this.deps.removeEntry(p);
				} catch (e) {
					err = e instanceof Error ? e.message : String(e);
				}
			}
		}
		if (tracked.length) {
			const res = await gitDiscard(root, tracked);
			if (!res.ok) err = res.error;
		}
		return err;
	}

	#deleteOutright(paths: string[]): Promise<boolean> {
		const one = paths.length === 1;
		const msg = one ? m.vcs_confirm_no_trash_one() : m.vcs_confirm_no_trash_other();
		const detail = one ? m.vcs_confirm_no_trash_one_detail() : m.vcs_confirm_no_trash_other_detail();
		return confirmAsk(msg, { detail, confirmLabel: m.vcs_delete_permanently(), danger: true });
	}
}
