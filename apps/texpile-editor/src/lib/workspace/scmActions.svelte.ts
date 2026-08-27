// source control ops: call the git client, refresh status, toast on failure. the panel is
// presentational; WorkspaceView wires the deps.
import { workspaceRoot } from './workspaceStore';
import { refreshGitStatus, refreshGitHistory, isGitRepo, gitChanges } from './gitStore';
import {
	gitInit,
	gitStage,
	gitUnstage,
	gitDiscard,
	gitCommit,
	gitRestore,
	gitChangesSince,
	gitPush,
	type GitStatusEntry,
	type GitFileChange
} from './git';
import { uploadReason } from './uploadReason';
import { basename, samePath, joinPath } from './fileSystem';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type ScmDeps = {
	getLoadedPath(): string | null;
	/** drop the open file's queued autosave before git rewrites it on disk. */
	discardPendingSave(): void;
	/** an edit is typed but not yet on disk. With autosave off that is everything since the last
	 *  manual save, and git cannot see any of it. */
	hasPendingSave(): boolean;
	/** write that edit out and wait for it to land, so git can see it */
	flushPendingSave(): Promise<void>;
	deleteEntry(path: string): Promise<unknown>;
	refreshTree(): Promise<void>;
	loadFile(path: string): Promise<void>;
	/** re-diff the open comparison (after a commit moved HEAD). */
	captureDiffSnapshot(): void;
	isDiffMode(): boolean;
	/** open (or focus) a tab comparing `path` against one version. */
	openCompareTab(path: string, compare: { hash: string; subject: string }): void;
	/** the .gitignore patterns for this project's compile format */
	ignoreLines(): string[];
	writeText(path: string, content: string): Promise<void>;
	/** null when the file does not exist yet */
	readTextIfPresent(path: string): Promise<string | null>;
};

export class ScmActions {
	busy = $state(false);

	constructor(private deps: ScmDeps) {}

	init = async () => {
		const root = workspaceRoot.current;
		if (!root) return;
		this.busy = true;
		const res = await gitInit(root);
		this.busy = false;
		if (!res.ok) {
			toaster.error({ title: m.wsview_toast_git_init_failed_title(), description: res.error });
			return;
		}
		await refreshGitStatus(root);
		toaster.success({ title: m.wsview_toast_git_init_success_title() });
	};

	stage = async (paths: string[]) => {
		const root = workspaceRoot.current;
		if (!root) return;
		this.busy = true;
		const res = await gitStage(root, paths);
		this.busy = false;
		if (!res.ok) toaster.error({ title: m.wsview_toast_stage_failed_title(), description: res.error });
		await refreshGitStatus(root);
	};

	unstage = async (paths: string[]) => {
		const root = workspaceRoot.current;
		if (!root) return;
		this.busy = true;
		const res = await gitUnstage(root, paths);
		this.busy = false;
		if (!res.ok) toaster.error({ title: m.wsview_toast_unstage_failed_title(), description: res.error });
		await refreshGitStatus(root);
	};

	discard = async (changes: GitStatusEntry[]) => {
		const root = workspaceRoot.current;
		if (!root || !changes.length) return;
		const confirmMsg =
			changes.length === 1
				? m.wsview_confirm_discard_one({ name: basename(changes[0].path) })
				: m.wsview_confirm_discard_other({ count: changes.length });
		if (!(await confirmAsk(confirmMsg, { confirmLabel: m.vcs_discard_changes(), danger: true }))) return;
		// if the open file is being discarded, drop its queued autosave first: otherwise a debounced
		// write scheduled just before the confirm lands after git reverts and re-creates the changes
		const loadedPath = this.deps.getLoadedPath();
		if (loadedPath && changes.some((c) => samePath(c.path, loadedPath))) this.deps.discardPendingSave();
		this.busy = true;
		// untracked files are deleted; tracked files are reverted to their staged/committed state
		const untracked = changes.filter((c) => c.x === '?').map((c) => c.path);
		const tracked = changes.filter((c) => c.x !== '?').map((c) => c.path);
		let err: string | undefined;
		for (const p of untracked) {
			try {
				await this.deps.deleteEntry(p);
			} catch (e) {
				err = e instanceof Error ? e.message : String(e);
			}
		}
		if (tracked.length) {
			const res = await gitDiscard(root, tracked);
			if (!res.ok) err = res.error;
		}
		this.busy = false;
		if (err) toaster.error({ title: m.wsview_toast_discard_failed_title(), description: err });
		const openAffected = !!loadedPath && changes.some((c) => c.path === loadedPath);
		await this.deps.refreshTree();
		await refreshGitStatus(root);
		if (openAffected && loadedPath) await this.deps.loadFile(loadedPath); // its on-disk content changed
	};

	/** the index is reset and rebuilt from the tick boxes every time, so what the button promised
	 *  is what lands and a stale staged file cannot ride along */
	commit = async (message: string, paths: string[]): Promise<boolean> => {
		const root = workspaceRoot.current;
		if (!root || !paths.length) return false;
		this.busy = true;
		const clear = await gitUnstage(root, []);
		if (!clear.ok) {
			this.busy = false;
			toaster.error({ title: m.wsview_toast_unstage_failed_title(), description: clear.error });
			return false;
		}
		const staged = await gitStage(root, paths);
		if (!staged.ok) {
			this.busy = false;
			toaster.error({ title: m.wsview_toast_stage_failed_title(), description: staged.error });
			return false;
		}
		const res = await gitCommit(root, message);
		this.busy = false;
		if (!res.ok) {
			toaster.error({ title: m.wsview_toast_commit_failed_title(), description: res.error });
			return false;
		}
		await refreshGitStatus(root);
		await refreshGitHistory(root);
		if (this.deps.isDiffMode()) this.deps.captureDiffSnapshot(); // the open diff now compares against the new HEAD
		toaster.success({ title: m.wsview_toast_commit_created_title() });
		return true;
	};

	/** Clears the way for a restore, and asks about it first.
	 *
	 *  Returns false when the answer was no, or when saving failed. Nothing is written before the
	 *  answer: with autosave off, a Restore that was cancelled must not have saved the file as a
	 *  side effect of being considered. */
	private async saveBeforeRestore(root: string, entry: { hash: string; subject: string }): Promise<boolean> {
		function inTheWay(): string[] {
			return gitChanges.current.filter((c) => c.x !== '?').map((c) => c.path);
		}
		const dirty = this.deps.hasPendingSave() || inTheWay().length > 0;

		const ok = await confirmAsk(
			dirty ? m.vcs_confirm_restore_unsaved({ name: entry.subject }) : m.vcs_confirm_restore({ name: entry.subject }),
			{ confirmLabel: dirty ? m.vcs_save_and_restore() : m.vcs_restore() }
		);
		if (!ok || !dirty) return ok;

		await this.deps.flushPendingSave();
		await refreshGitStatus(root); // the edit is on disk now, so git can finally count it
		const paths = inTheWay();
		if (!paths.length) return true; // what was queued turned out to match what was already saved
		return this.commit(m.vcs_restore_presave({ name: entry.subject }), paths);
	}

	/** additive: recorded as a new commit, so restoring the entry above undoes it.
	 *  Takes the ENTRY, like compare does - the panel has only ever handed one over, and taking a
	 *  hash and a subject instead meant the entry arrived as `hash` and the subject as undefined. */
	restore = async (entry: { hash: string; subject: string }): Promise<boolean> => {
		const root = workspaceRoot.current;
		if (!root) return false;

		// Work that would be in the way, counted BEFORE asking - the restore refuses on a dirty tree,
		// and being refused after confirming reads as a bug. Only TRACKED changes count: gitRestore
		// checks --untracked-files=no, so an untracked file neither blocks it nor belongs in the
		// version below, having never been chosen for the repo. The typed-but-unwritten edit counts
		// too, and git cannot see it - that is exactly the work the old discard threw away in silence.
		if (!(await this.saveBeforeRestore(root, entry))) return false;

		this.busy = true;
		const res = await gitRestore(root, entry.hash, m.vcs_restore_message({ name: entry.subject }));
		this.busy = false;
		if (!res.ok) {
			toaster.error({ title: m.vcs_toast_restore_failed(), description: res.error });
			return false;
		}
		const loadedPath = this.deps.getLoadedPath();
		await this.deps.refreshTree();
		await refreshGitStatus(root);
		await refreshGitHistory(root);
		if (loadedPath) await this.deps.loadFile(loadedPath); // its bytes on disk just changed
		toaster.success({ title: m.vcs_toast_restored() });
		return true;
	};

	/** Appends, never replaces, and skips lines already present, so an existing .gitignore is not
	 *  rewritten out from under the project. The output PDF is deliberately not among them. */
	ignoreArtifacts = async (): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root) return;
		const path = joinPath(root, '.gitignore');
		this.busy = true;
		try {
			const existing = await this.deps.readTextIfPresent(path);
			const have = new Set(
				(existing ?? '')
					.split('\n')
					.map((l) => l.trim())
					.filter(Boolean)
			);
			const wanted = this.deps.ignoreLines().filter((l) => l.startsWith('#') || !have.has(l));
			// nothing but the header left: every pattern is already there
			if (wanted.every((l) => l.startsWith('#'))) {
				this.busy = false;
				toaster.success({ title: m.vcs_toast_ignored() });
				return;
			}
			const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
			await this.deps.writeText(path, `${existing ?? ''}${prefix}${existing ? '\n' : ''}${wanted.join('\n')}\n`);
		} catch (e) {
			this.busy = false;
			toaster.error({ title: m.vcs_toast_ignore_failed(), description: e instanceof Error ? e.message : String(e) });
			return;
		}
		this.busy = false;
		await this.deps.refreshTree();
		await refreshGitStatus(root);
		toaster.success({ title: m.vcs_toast_ignored() });
	};

	/** against the last saved version, in its own tab */
	openDiff = (path: string) => {
		if (!isGitRepo.current) return;
		this.deps.openCompareTab(path, { hash: 'HEAD', subject: m.vcs_last_version() });
	};

	/** the panel hands over the file rather than asking the editor what happens to be open */
	compare = (entry: { hash: string; subject: string }, path: string) => {
		if (!isGitRepo.current || !path) return;
		this.deps.openCompareTab(path, { hash: entry.hash, subject: entry.subject });
	};

	/** Send saved versions to the upstream. Push only: it never fetches or merges, so a remote that
	 *  has moved on is reported and left alone rather than combined with guesswork. */
	upload = async (): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root) return;
		this.busy = true;
		const res = await gitPush(root);
		this.busy = false;
		if (res.ok) {
			await refreshGitStatus(root); // the ahead count is now zero, and the button goes with it
			toaster.success({ title: m.vcs_toast_uploaded({ remote: res.remote ?? '' }) });
			return;
		}
		toaster.error({ title: m.vcs_toast_upload_failed(), description: uploadReason(res) });
	};

	/** read on expand, not with the log: the answer changes as the author types */
	changesSince = async (hash: string): Promise<GitFileChange[]> => {
		const root = workspaceRoot.current;
		if (!root || !isGitRepo.current) return [];
		const res = await gitChangesSince(root, hash);
		return res.ok ? (res.entries ?? []) : [];
	};
}
