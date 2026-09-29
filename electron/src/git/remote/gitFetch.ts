// Check for new versions: fetch the remote this branch syncs with and report how far behind it is,
// taking nothing in. For a co-author who wants to know whether someone uploaded before deciding to
// Sync; Refresh stays offline. VS Code's Fetch, without fetch-all or a remote picker, and pruning
// what was deleted there.
import { errMsg, isMissingGit, resolveRepoRoot, upstreamExists } from '../gitService';
import { aheadBehind, classifyPushError, netGit, upstreamOf, type GitAuthEnv, type PushFailure } from './gitRemote';

export type GitFetchResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	failure?: PushFailure;
	error?: string;
	remote?: string;
	/** versions there that are not here, and the other way round, as of this fetch */
	behind?: number;
	ahead?: number;
};

/** `stall`: for the automatic check only, which asks nobody to sign in, how long git may go without
 *  a word before it is stopped. A connection that stalled kept it pending for good, and a Sync waits
 *  for it to finish first. 0 (none) for a check the author asked for, which may be waiting on them. */
export async function gitFetch(workspaceRoot: string, auth: GitAuthEnv = {}, stall = 0): Promise<GitFetchResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const g = netGit(rr.repo.root, auth, stall);
	let remote: string | undefined;
	try {
		const status = await g.status();
		if (!status.current || status.detached || !status.tracking) return { ok: false, failure: 'no-upstream' };
		const up = await upstreamOf(g, status.current);
		if (!up) return { ok: false, failure: 'no-upstream' };
		remote = up.remote;
		// --prune: a branch deleted there is dropped here too, or it would look alive for ever and a
		// Sync would publish it again. --progress: with no terminal git reports nothing until it is
		// done, and a long download would look stalled.
		await g.raw(['fetch', ...(stall > 0 ? ['--progress'] : []), '--prune', '--', up.remote]);
		// the branch was deleted there (and pruned by this fetch): nothing to compare with
		if (!(await upstreamExists(g))) return { ok: false, failure: 'no-upstream', remote };
		const [ahead, behind] = await aheadBehind(g);
		return { ok: true, remote, ahead, behind };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		const msg = errMsg(e);
		return { ok: false, failure: classifyPushError(msg), error: msg, remote };
	}
}
