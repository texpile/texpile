// Branches for the command palette's Switch branch: the branches to switch to, and switching. VS
// Code's Git: Checkout to..., with the refusals said in words: git will not switch over unsaved
// work it would overwrite. Creating and deleting branches is left to git itself: Texpile cannot join
// two branches, so it does not start them. A co-author's branch that is only on the remote is the
// one exception, as in VS Code: checking it out makes the local branch that follows it.
import { git, patientGit, errMsg, isMissingGit, resolveRepoRoot, retryLocked, gitDirsOf, operationIn } from '../gitService';
import type { GitOpResult } from '../gitService';
import { OVERWRITE_RE, parseBlockingFiles } from '../remote/gitRemote';

export type GitBranch = {
	name: string;
	/** the remote branch it tracks, 'origin/main', or null */
	upstream: string | null;
	/** when the branch last had a version saved to it, ISO 8601 */
	date: string;
};

export type GitBranchesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	/** null when HEAD is a commit rather than a branch */
	current?: string | null;
	local?: GitBranch[];
	/** branches only on a remote, 'origin/revisions': none a local branch already follows */
	remote?: GitBranch[];
};

export type GitSwitchResult = GitOpResult & {
	/** 'dirty': unsaved work the switch would overwrite. 'busy': a merge or rebase is under way.
	 *  'missing': no such branch. */
	failure?: 'dirty' | 'busy' | 'missing';
	/** what stood in the way of a 'dirty', absolute */
	files?: string[];
	/** the branch now checked out */
	branch?: string;
};

const SEP = '\x1f';

/** exported for the tests: for-each-ref lines of short name, upstream and date */
export function parseRefs(raw: string): GitBranch[] {
	const local: GitBranch[] = [];
	for (const line of raw.split('\n')) {
		const [short, upstream, date] = line.split(SEP);
		if (short) local.push({ name: short, upstream: upstream || null, date: date ?? '' });
	}
	return local;
}

/** exported for the tests: for-each-ref lines of short name, symref and date for refs/remotes,
 *  less a remote's HEAD (origin/HEAD), which only points at one of the others, and less what a
 *  local branch already follows */
export function remoteOnly(raw: string, local: GitBranch[]): GitBranch[] {
	const followed = new Set(local.map((b) => b.upstream));
	return parseRefs(raw)
		.filter((b) => !b.upstream && !followed.has(b.name))
		.map((b) => ({ ...b, upstream: null }));
}

export async function gitBranches(workspaceRoot: string): Promise<GitBranchesResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	try {
		const g = git(rr.repo.root);
		const refs = (second: string, prefix: string) =>
			g.raw([
				'for-each-ref',
				'--sort=-committerdate',
				`--format=%(refname:lstrip=2)${SEP}%(${second})${SEP}%(committerdate:iso-strict)`,
				prefix
			]);
		const local = parseRefs(await refs('upstream:lstrip=2', 'refs/heads'));
		const remote = remoteOnly(await refs('symref', 'refs/remotes'), local);
		// with -q, a detached HEAD prints nothing and exits 1, which simple-git resolves as ''
		const current = (await g.raw(['symbolic-ref', '-q', 'HEAD'])).trim().replace(/^refs\/heads\//, '') || null;
		return { ok: true, current, local, remote };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/**
 * Check out a branch. Unsaved work git can carry over comes along, as it does in a terminal;
 * work the switch would overwrite stops it before anything changes. `git switch` rather than
 * checkout: it never reads its argument as a file. A remote branch, 'origin/revisions', goes to the
 * local branch that follows it, made with --track when there is none (VS Code's CheckoutRemoteHeadItem).
 */
export async function gitSwitch(workspaceRoot: string, name: string): Promise<GitSwitchResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const repo = rr.repo;
	// patient (gitService.ts): a switch rewrites files through their filters, a Git LFS download
	// among them, and runs the post-checkout hook
	const g = patientGit(repo.root);
	try {
		if (operationIn((await gitDirsOf(repo.root)).gitDir)) return { ok: false, failure: 'busy' };
		const local = parseRefs(await g.raw(['for-each-ref', `--format=%(refname:lstrip=2)${SEP}%(upstream:lstrip=2)`, 'refs/heads']));
		if (local.some((b) => b.name === name)) await retryLocked(() => g.raw(['switch', '--', name]));
		else {
			const remote = (await g.raw(['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/remotes'])).split('\n');
			if (!remote.includes(name)) return { ok: false, failure: 'missing' };
			const follower = local.find((b) => b.upstream === name)?.name;
			await retryLocked(() => g.raw(follower ? ['switch', '--', follower] : ['switch', '--track', '--', name]));
		}
		const branch = (await g.raw(['symbolic-ref', '-q', 'HEAD'])).trim().replace(/^refs\/heads\//, '');
		return { ok: true, branch };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		const msg = errMsg(e);
		if (OVERWRITE_RE.test(msg))
			return { ok: false, failure: 'dirty', files: parseBlockingFiles(msg).map((p) => repo.fromGit(p)), error: msg };
		return { ok: false, error: msg };
	}
}
