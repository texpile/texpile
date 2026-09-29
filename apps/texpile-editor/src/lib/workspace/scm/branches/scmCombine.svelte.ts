// Combining two lines of work from the Source Control panel: what Sync offers when both sides
// changed the same lines, and the Finish and Cancel that end it. The places themselves are chosen
// in the source editor (lib/editor/source/cmConflicts.ts).
import { askWholeFile, type WholeFileChoice } from '../../wholeFileChoice';
import { workspaceRoot } from '../../workspaceStore';
import { refreshGitStatus, refreshGitHistory, gitChanges, isConflicted } from '../gitStore';
import { gitCombine, gitFinishCombine, gitCancelCombine, gitKeepSide, type GitCombineResult } from './gitCombine';
import type { GitSyncResult, GitStatusEntry } from '../git';
import { firstConflictLine } from '../conflictMarkers';
import { basename, samePath } from '../../fileSystem';
import { confirmAsk, promptAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { localGitReason } from '../gitLocalReason';
import { toastGitFailure } from '../gitFailureToast';
import { m } from '$lib/paraglide/messages';
import type { ScmDeps } from '../actions/scmActions.svelte';

/** what the combining steps borrow from ScmActions: its write lock and its identity check */
export type CombineHost = {
	busy: boolean;
	ensureIdentity(root: string): Promise<boolean>;
	openDiff(path: string): void;
};

function names(paths: string[]): string {
	return paths.map((p) => basename(p)).join(', ');
}

/** a file the merge wrote: one it left marked, or one it took in and staged. Combine starts from a
 *  clean tree, so nothing else is staged while it runs. */
function fromTheMerge(c: GitStatusEntry): boolean {
	return isConflicted(c.x, c.y) || (c.x !== ' ' && c.x !== '?');
}

function combineReason(res: GitCombineResult): string {
	if (res.failure === 'dirty') return m.vcs_combine_dirty({ files: names(res.files ?? []) });
	if (res.failure === 'busy') return m.vcs_toast_finish_first();
	// git's own words are behind Details
	return localGitReason(res.error);
}

export class ScmCombine {
	constructor(
		private host: CombineHost,
		private deps: ScmDeps
	) {}

	/** git rewrote files under the editor: the same reload a restore does */
	private async reload(root: string): Promise<void> {
		const loadedPath = this.deps.getLoadedPath();
		await this.deps.refreshTree();
		if (loadedPath) await this.deps.loadFile(loadedPath);
		if (this.deps.isDiffMode()) this.deps.captureDiffSnapshot();
		await refreshGitStatus(root);
		await refreshGitHistory(root);
	}

	/**
	 * Sync stopped because both sides changed the same lines, and put everything back. Offer to
	 * start that merge for real and leave each such place marked, rather than send the author to
	 * a terminal. Runs inside Sync's busy window.
	 */
	async offer(root: string, res: GitSyncResult): Promise<void> {
		const files = res.files ?? [];
		const remote = res.remote ?? '';
		const choice = await promptAsk({
			title: m.vcs_combine_title(),
			message:
				files.length === 1
					? m.vcs_combine_message_one({ remote, file: basename(files[0]) })
					: m.vcs_combine_message_count({ remote, count: files.length }),
			detail: files.length > 1 ? files.join('\n') : undefined,
			buttons: [
				{ id: 'combine', label: m.vcs_combine_now(), primary: true },
				{ id: 'later', label: m.vcs_combine_later() }
			],
			cancelId: 'later'
		});
		// another folder opened while this was asked: the merge would start here with that one on screen
		if (choice !== 'combine' || !samePath(workspaceRoot.current ?? '', root)) return;

		const combined = await gitCombine(root);
		if (!combined.ok) {
			toastGitFailure(m.vcs_toast_combine_failed(), combineReason(combined), combined);
			await refreshGitStatus(root);
			return;
		}
		// the status read waits while Source Control is writing, and this runs inside Sync's busy
		// window: without letting it through, which file to open was decided from the status before
		// the merge, where no file is a figure or a deleted one yet
		this.host.busy = false;
		await this.reload(root);
		this.host.busy = true;
		const conflicts = combined.conflicts ?? [];
		if (!conflicts.length) {
			// the remote moved on again and git could join the two by itself this time
			toaster.success({ title: m.vcs_toast_combined(), description: m.vcs_toast_combined_send({ remote }) });
			return;
		}
		// the first file with places to choose at; a figure or a deleted file has none to open to, and
		// its row asks which version to keep
		const marked = conflicts.find((p) => !gitChanges.current.find((c) => samePath(c.path, p))?.choose);
		if (!marked) {
			toaster.info({ title: m.vcs_toast_combine_started(), description: m.vcs_toast_combine_whole_desc() });
			return;
		}
		toaster.info({ title: m.vcs_toast_combine_started() });
		await this.openConflict(marked);
	}

	/** the file in the source editor at its first marked place. A file one side deleted has none:
	 *  the comparison with the last version shows what the other side did to it. */
	openConflict = async (path: string): Promise<void> => {
		const text = await this.deps.readTextIfPresent(path);
		if (text === null) return this.host.openDiff(path);
		this.deps.openAtLine(path, firstConflictLine(text) ?? 1);
	};

	/** save the merge as a version, once every place is chosen */
	finish = async (): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root || this.host.busy) return;
		this.host.busy = true;
		try {
			if (!(await this.host.ensureIdentity(root))) return;
			// the last choice may still be waiting to be written, and git reads the file on disk
			if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
			const res = await gitFinishCombine(root);
			await refreshGitStatus(root);
			if (!res.ok) {
				if (res.failure === 'markers') {
					toaster.warning({ title: m.vcs_toast_finish_marked(), description: names(res.files ?? []) });
					if (res.files?.[0]) await this.openConflict(res.files[0]);
				} else {
					toastGitFailure(m.vcs_toast_finish_combine_failed(), localGitReason(res.error), res);
				}
				return;
			}
			await refreshGitHistory(root);
			this.deps.settleConflicts();
			toaster.success({ title: m.vcs_toast_combined(), description: m.vcs_toast_combined_sync() });
		} finally {
			this.host.busy = false;
		}
	};

	/** Keep all mine or theirs for a whole file, from its row: for a figure or a PDF there are no
	 *  places to click, and when one side deleted the file there is no text to choose in */
	keepSide = async (path: string, side: 'mine' | 'theirs'): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root || this.host.busy) return;
		// as in cancel(): the file's half-chosen text, still waiting to be written, would land on top
		// of the side just kept. Any other file's edit is written first
		const loadedPath = this.deps.getLoadedPath();
		if (loadedPath && samePath(loadedPath, path)) this.deps.discardPendingSave();
		else if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
		this.host.busy = true;
		const res = await gitKeepSide(root, path, side);
		this.host.busy = false;
		if (!res.ok) {
			toastGitFailure(m.vcs_keep_side_failed({ name: basename(path) }), localGitReason(res.error), res);
			return;
		}
		await this.reload(root);
	};

	/** VS Code's Keep Our Version / Delete File, and the same for a figure: asked, then kept */
	chooseWhole = async (path: string, choose: WholeFileChoice): Promise<void> => {
		if (this.host.busy) return;
		const side = await askWholeFile(basename(path), choose);
		if (side) await this.keepSide(path, side);
	};

	/** undo the merge: every file as it was before it started, the choices made so far with it */
	cancel = async (): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root || this.host.busy) return;
		const ok = await confirmAsk(m.vcs_confirm_cancel_combine(), {
			detail: m.vcs_confirm_cancel_combine_detail(),
			confirmLabel: m.vcs_cancel_combine(),
			cancelLabel: m.vcs_keep_combining(),
			danger: true
		});
		if (!ok) return;
		// A choice typed but not yet written would land after git puts the file back, and undo it.
		// Any other file's edit is written first: git keeps what the merge did not touch.
		const loadedPath = this.deps.getLoadedPath();
		if (loadedPath && gitChanges.current.some((c) => samePath(c.path, loadedPath) && fromTheMerge(c))) this.deps.discardPendingSave();
		else if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
		this.host.busy = true;
		try {
			const res = await gitCancelCombine(root);
			if (!res.ok) {
				toastGitFailure(m.vcs_toast_cancel_combine_failed(), localGitReason(res.error), res);
				await refreshGitStatus(root);
				return;
			}
			await this.reload(root);
			toaster.success({ title: m.vcs_toast_combine_cancelled() });
		} finally {
			this.host.busy = false;
		}
	};
}
