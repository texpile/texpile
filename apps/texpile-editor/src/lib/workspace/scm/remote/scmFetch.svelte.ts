// Check for new versions (electron/src/git/remote/gitFetch.ts): fetch what the remote has and say whether
// there is anything to Sync, taking nothing in. Refresh stays offline.
import { workspaceRoot } from '../../workspaceStore';
import { refreshGitStatus, gitRunning } from '../gitStore';
import { nativeBridge } from '../../fileSystem';
import { NO_BRIDGE, errMsg, type PushFailure } from '../git';
import { uploadReason } from '../../uploadReason';
import { autoCheckDone, resumeAutoCheck } from '../actions/scmAutoCheck.svelte';
import { toastGitFailure } from '../gitFailureToast';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type GitFetchResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	failure?: PushFailure;
	error?: string;
	remote?: string;
	behind?: number;
	ahead?: number;
};

export type GitFetchBridge = {
	gitFetch?: (root: string) => Promise<GitFetchResult>;
};

async function gitFetch(root: string): Promise<GitFetchResult> {
	const n = nativeBridge();
	if (!n?.gitFetch) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitFetch(root);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** `host` is ScmActions: its busy flag keeps a Save version or Sync from starting underneath */
export class ScmFetch {
	constructor(private host: { busy: boolean; sync: () => unknown }) {}

	checkForNew = async (): Promise<void> => {
		const root = workspaceRoot.current;
		if (!root || this.host.busy) return;
		await autoCheckDone(); // one fetch at a time
		if (this.host.busy) return;
		this.host.busy = true;
		gitRunning.current = 'fetch';
		let res: GitFetchResult;
		try {
			res = await gitFetch(root);
		} finally {
			this.host.busy = false;
			gitRunning.current = null;
		}
		await refreshGitStatus(root);
		const remote = res.remote ?? '';
		if (!res.ok) {
			if (res.failure !== 'cancelled') toastGitFailure(m.vcs_toast_fetch_failed(), uploadReason(res), res);
			return;
		}
		resumeAutoCheck();
		const behind = res.behind ?? 0;
		// nothing to do reads the same everywhere (Sync already up to date, a restore that changes
		// nothing): info. New versions offer Sync, as the automatic check's notice does
		if (!behind) toaster.info({ title: m.vcs_fetch_none({ remote }) });
		else
			toaster.info({
				title: behind === 1 ? m.vcs_fetch_new_one({ remote }) : m.vcs_fetch_new_count({ remote, count: behind }),
				description: m.vcs_fetch_new_detail(),
				action: { label: m.vcs_action_sync(), onClick: () => void this.host.sync() }
			});
	};
}
