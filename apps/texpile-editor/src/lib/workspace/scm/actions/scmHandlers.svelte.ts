// Source Control actions reached from deep inside the panel (a change row's menu, the control
// beside the branch) or from the palette, carried out by the open workspace's ScmActions. A module
// rather than props, as versionChanges.svelte.ts: the rows are four components below the workspace,
// and the palette is not below it at all.
import type { WholeFileChoice } from '../../wholeFileChoice';
import type { GitBranchesResult } from '../branches/gitBranches';
import { tick } from 'svelte';
export type ScmHandlers = {
	/** add new folders (a trailing slash) to the project's .gitignore */
	ignore(paths: string[]): void;
	/** fetch the upstream's remote, so the counts beside Sync are current, and take nothing in */
	checkForNew(): void;
	/** this file against its last version, in its own tab */
	compare(path: string): void;
	/** the branch syncs with a remote, so there is somewhere to check for new versions */
	hasUpstream(): boolean;
	/** one side's whole file, for a file both sides changed */
	keepSide(path: string, side: 'mine' | 'theirs'): void;
	/** ask which side of a deleted or non-text file to keep (wholeFileChoice.ts), then keep it */
	chooseWhole(path: string, choose: WholeFileChoice): void;
	/** the project is a repository and the app can switch its branch: Switch branch is offered */
	canSwitchBranch(): boolean;
	/** the local branches, for the palette's Switch branch */
	listBranches(): Promise<GitBranchesResult>;
	/** check one out, saving unsaved changes first if the switch would overwrite them */
	switchBranch(name: string): void;
};

let current = $state<ScmHandlers | null>(null);

export const scmHandlers = {
	get current(): ScmHandlers | null {
		return current;
	}
};

/** the workspace provides them while it is open; the returned function lets go */
export function provideScmHandlers(handlers: ScmHandlers): () => void {
	current = handlers;
	return () => {
		if (current === handlers) current = null;
	};
}

/** the keyboard into the message box once the panel has drawn it (VS Code's Ctrl+Shift+G); with
 *  nothing to save there is no box, and the panel is simply showing */
export function focusScmMessage(): void {
	void tick().then(() => requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-scm-message]')?.focus()));
}
