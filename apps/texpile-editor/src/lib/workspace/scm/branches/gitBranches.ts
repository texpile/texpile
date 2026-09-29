// client half of electron/src/git/history/gitBranches.ts: the branch list and switching. Never throws.
import { nativeBridge } from '../../fileSystem';
import { NO_BRIDGE, errMsg } from '../git';

export type GitBranch = { name: string; upstream: string | null; date: string };

export type GitBranchesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	current?: string | null;
	local?: GitBranch[];
	/** branches only on a remote, 'origin/revisions' */
	remote?: GitBranch[];
};

export type GitSwitchResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	failure?: 'dirty' | 'busy' | 'missing';
	files?: string[];
	branch?: string;
};

/** Optional: an older preload predates it, and Switch branch is not offered. */
export type GitBranchBridge = {
	gitBranches?: (root: string) => Promise<GitBranchesResult>;
	gitSwitch?: (root: string, name: string) => Promise<GitSwitchResult>;
};

export function canSwitchBranch(): boolean {
	return !!nativeBridge()?.gitSwitch;
}

async function call<R extends { ok: boolean; error?: string }>(run: (() => Promise<R>) | null): Promise<R> {
	if (!run) return { ok: false, error: NO_BRIDGE } as R;
	try {
		return await run();
	} catch (e) {
		return { ok: false, error: errMsg(e) } as R;
	}
}

export function gitBranches(root: string): Promise<GitBranchesResult> {
	const n = nativeBridge();
	return call(n?.gitBranches ? () => n.gitBranches!(root) : null);
}

export function gitSwitch(root: string, name: string): Promise<GitSwitchResult> {
	const n = nativeBridge();
	return call(n?.gitSwitch ? () => n.gitSwitch!(root, name) : null);
}
