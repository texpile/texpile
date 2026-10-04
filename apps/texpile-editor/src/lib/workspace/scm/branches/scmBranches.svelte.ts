// Switch branch, from the command palette: VS Code's Git: Checkout to..., for local branches and a
// co-author's branch on the remote. The editor follows: the file tree is read again and the open
// file reloaded, since a switch rewrites files under both. Texpile does not start or delete
// branches: it cannot join two of them again.
import { workspaceRoot } from '../../workspaceStore';
import { refreshGitStatus, refreshGitHistory, gitOperation } from '../gitStore';
import { saveChangesFirst } from '../actions/scmSaveFirst';
import { gitBranches, gitSwitch, type GitBranchesResult, type GitSwitchResult } from './gitBranches';
import { basename } from '../../fileSystem';
import { toaster } from '$lib/modals/toaster-svelte';
import { toastGitFailure } from '../gitFailureToast';
import { m } from '$lib/paraglide/messages';
import type { ScmDeps } from '../actions/scmActions.svelte';

export type BranchHost = {
	busy: boolean;
	/** ScmActions.commit: Save version with these files and this message, in this folder */
	commit(message: string, paths: string[], root: string): Promise<boolean>;
};

/** exported for the tests: why a switch did not happen */
export function switchReason(res: GitSwitchResult): string {
	if (res.reason === 'no-git') return m.vcs_git_missing();
	switch (res.failure) {
		case 'dirty':
			return m.vcs_branch_dirty({ files: (res.files ?? []).map((f) => basename(f)).join(', ') });
		case 'busy':
			return m.vcs_toast_finish_first();
		default:
			return res.error || m.vcs_branch_failed();
	}
}

export class ScmBranches {
	constructor(
		private host: BranchHost,
		private deps: ScmDeps
	) {}

	list = async (): Promise<GitBranchesResult> => {
		const root = workspaceRoot.current;
		return root ? gitBranches(root) : { ok: false };
	};

	/** switch, saying so in a notice either way: the palette that asked has closed */
	switchTo = async (name: string): Promise<void> => {
		const why = await this.change(name);
		if (why) toastGitFailure(m.vcs_toast_switch_failed(), why, {});
	};

	/**
	 * The switch would overwrite changes not saved as a version: offer to save them on this branch
	 * first - what the panel has staged, and the files in the way. What the author unstaged is left
	 * for the checkout to carry over. True once saved, and the switch is tried again.
	 */
	private saveFirst(root: string, name: string, blocking: string[]): Promise<boolean> {
		const host = {
			root,
			commit: (message: string, paths: string[]) => this.host.commit(message, paths, root),
			setBusy: (on: boolean) => (this.host.busy = on)
		};
		return saveChangesFirst(host, {
			title: m.vcs_branch_dirty_title(),
			message: m.vcs_branch_dirty_message({ files: blocking.map((f) => basename(f)).join(', ') }),
			confirm: m.vcs_branch_save_and_switch(),
			version: m.vcs_branch_autosave_message({ branch: name }),
			blocking
		});
	}

	/** why it did not happen, '' when the author backed out, or null once switched */
	private async change(name: string): Promise<string | null> {
		const root = workspaceRoot.current;
		if (!root || this.host.busy) return '';
		if (gitOperation.current) return m.vcs_toast_finish_first();
		this.host.busy = true;
		try {
			// on disk first: git can then refuse to overwrite the edit, instead of the edit landing on
			// the other branch's copy of the file after the switch
			if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
			let res = await gitSwitch(root, name);
			if (!res.ok && res.failure === 'dirty') {
				// VS Code offers to stash; a writer's word for keeping work safe is a version
				if (!(await this.saveFirst(root, name, res.files ?? []))) return '';
				res = await gitSwitch(root, name);
			}
			if (!res.ok) return switchReason(res);
			const loaded = this.deps.getLoadedPath();
			await this.deps.refreshTree();
			// typed while git switched: the save guard asks about it, as after a sync
			if (this.deps.hasPendingSave()) await this.deps.flushPendingSave();
			// a file the other branch does not have is left to the editor's own "deleted on disk" state
			if (loaded && !this.deps.hasPendingSave() && (await this.deps.readTextIfPresent(loaded)) !== null) await this.deps.loadFile(loaded);
			if (this.deps.isDiffMode()) this.deps.captureDiffSnapshot();
			await refreshGitStatus(root);
			await refreshGitHistory(root);
			toaster.success({ title: m.vcs_toast_switched({ branch: res.branch || name }) });
			return null;
		} finally {
			this.host.busy = false;
		}
	}
}
