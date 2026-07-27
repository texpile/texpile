// source control ops: call the git client, refresh status, toast on failure. the panel is
// presentational; WorkspaceView wires the deps.
import { get } from 'svelte/store';
import { workspaceRoot, activeFilePath } from './workspaceStore';
import { refreshGitStatus, isGitRepo, gitChanges } from './gitStore';
import { gitInit, gitStage, gitUnstage, gitDiscard, gitCommit, type GitStatusEntry } from './git';
import { basename, samePath } from './fileSystem';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export interface ScmDeps {
	getLoadedPath(): string | null;
	/** drop the open file's queued autosave before git rewrites it on disk. */
	discardPendingSave(): void;
	deleteEntry(path: string): Promise<unknown>;
	refreshTree(): Promise<void>;
	loadFile(path: string): Promise<void>;
	/** re-diff the open diff view (after a commit moved HEAD, or when opening a diff). */
	captureDiffSnapshot(): void;
	isDiffMode(): boolean;
	enterDiffMode(): void;
}

export class ScmActions {
	busy = $state(false);

	constructor(private deps: ScmDeps) {}

	init = async () => {
		const root = get(workspaceRoot);
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
		const root = get(workspaceRoot);
		if (!root) return;
		this.busy = true;
		const res = await gitStage(root, paths);
		this.busy = false;
		if (!res.ok) toaster.error({ title: m.wsview_toast_stage_failed_title(), description: res.error });
		await refreshGitStatus(root);
	};

	unstage = async (paths: string[]) => {
		const root = get(workspaceRoot);
		if (!root) return;
		this.busy = true;
		const res = await gitUnstage(root, paths);
		this.busy = false;
		if (!res.ok) toaster.error({ title: m.wsview_toast_unstage_failed_title(), description: res.error });
		await refreshGitStatus(root);
	};

	discard = async (changes: GitStatusEntry[]) => {
		const root = get(workspaceRoot);
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

	commit = async (message: string): Promise<boolean> => {
		const root = get(workspaceRoot);
		if (!root) return false;
		this.busy = true;
		// if nothing is staged, stage everything first (the "Commit All" affordance)
		const hasStaged = get(gitChanges).some((c) => c.x !== ' ' && c.x !== '?');
		if (!hasStaged) {
			const s = await gitStage(root, []);
			if (!s.ok) {
				this.busy = false;
				toaster.error({ title: m.wsview_toast_stage_failed_title(), description: s.error });
				return false;
			}
		}
		const res = await gitCommit(root, message);
		this.busy = false;
		if (!res.ok) {
			toaster.error({ title: m.wsview_toast_commit_failed_title(), description: res.error });
			return false;
		}
		await refreshGitStatus(root);
		if (this.deps.isDiffMode()) this.deps.captureDiffSnapshot(); // the open diff now compares against the new HEAD
		toaster.success({ title: m.wsview_toast_commit_created_title() });
		return true;
	};

	// open a changed file's diff from the Source Control panel (keeps the SC sidebar open)
	openDiff = (path: string) => {
		if (!get(isGitRepo)) return;
		const already = this.deps.getLoadedPath() === path;
		activeFilePath.set(path);
		this.deps.enterDiffMode();
		if (already) this.deps.captureDiffSnapshot();
	};
}
