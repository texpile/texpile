// client-side git access over Electron IPC. never throws: a non-repo folder, a missing
// git binary, or a missing bridge comes back as { ok: false }
import type { WholeFileChoice } from '../wholeFileChoice';
import { nativeBridge } from '../fileSystem';

/** single-letter tree badge (VS Code convention). 'C' is a file both sides changed, which git
 *  could not combine: it holds conflict markers until someone chooses. */
export type GitBadge = 'M' | 'A' | 'D' | 'U' | 'R' | 'C';

/** git is part-way through combining histories and waiting for someone to finish or cancel */
export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

export type GitStatusEntry = {
	path: string; // absolute, matching the file-tree's path strings
	x: string; // index (staged) porcelain char, ' ' if none, '?' if untracked
	y: string; // working-dir (unstaged) porcelain char
	/** a file both sides changed that still holds a place marked for someone to choose; set only
	 *  on those files */
	markers?: boolean;
	/** a folder of new files shown as one row (electron/src/git/gitStatusLimit.ts): how many it holds */
	files?: number;
	/** a file both sides changed that is settled by keeping one whole side, and why */
	choose?: WholeFileChoice;
	/** a rename's old path: saving the rename takes in both, putting it back restores this */
	from?: string;
	/** a folder row that also holds files .gitignore leaves out, or a repository of its own: never
	 *  deleted as a whole */
	ignoredInside?: boolean;
};

export type GitStatusResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	/** reason 'unsafe': the repository git will not work in because another account owns it */
	unsafe?: string;
	error?: string;
	/** the list was cut short: how many changes there were */
	truncated?: number;
	branch?: string;
	entries?: GitStatusEntry[];
	/** the upstream this branch tracks ('origin/master'), or null if it tracks nothing */
	tracking?: string | null;
	/** versions here the upstream does not have; read from local refs, so no network and never stale */
	ahead?: number;
	/** as fresh as the last fetch: Sync runs one, and so may a terminal */
	behind?: number;
	/** false before the first version, when there is nothing to publish */
	hasCommits?: boolean;
	/** HEAD is a commit rather than a branch: nothing to publish or sync */
	detached?: boolean;
	/** the commit HEAD points at, '' before the first */
	head?: string;
	/** an unfinished merge, rebase, cherry-pick or revert, or null */
	operation?: GitOperation | null;
	/** where the repository starts: the folder itself, or one above it */
	repoRoot?: string;
};

export type GitShowResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	hasHead: boolean;
	content?: string;
};

export type GitOpResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
};

export const NO_BRIDGE = 'Git requires the Texpile desktop app.';

export function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

export async function gitStatus(root: string): Promise<GitStatusResult> {
	const n = nativeBridge();
	if (!n) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitStatus(root);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** committed (HEAD) contents of a file, for diffing against the working copy. */
export async function gitShowHead(path: string): Promise<GitShowResult> {
	const n = nativeBridge();
	if (!n) return { ok: false, hasHead: false, error: NO_BRIDGE };
	try {
		return await n.gitShow(path);
	} catch (e) {
		return { ok: false, hasHead: false, error: errMsg(e) };
	}
}

export async function gitInit(dir: string): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitInit(dir);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** stages files (empty = all). */
export async function gitStage(root: string, paths: string[] = []): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitStage(root, paths);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** unstages files (empty = all). */
export async function gitUnstage(root: string, paths: string[] = []): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitUnstage(root, paths);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** discards unstaged working-tree changes to tracked files. */
export async function gitDiscard(root: string, paths: string[]): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitDiscard(root, paths);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

export async function gitCommit(root: string, message: string): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitCommit(root, message);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** one file that differs between two states, by absolute path. `status` maps onto the tree's
 *  badge colours, so a file reads the same here as it does in the explorer. */
/** a rename carries the path it had before in `from` */
export type GitFileChange = { path: string; status: GitBadge; from?: string };

export type GitLogEntry = {
	hash: string;
	short: string;
	subject: string;
	/** the rest of the message after its first line, when it has more */
	body?: string;
	/** in one file's log: the file's path in this version, when it was named differently */
	path?: string;
	author: string;
	/** author date, ISO 8601 */
	date: string;
	/** versions this one was made from; two or more means it joined two lines of work */
	parentCount: number;
};

export type GitLogResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	entries?: GitLogEntry[];
	/** the history is longer than what was asked for, so `entries` is the newest slice of it */
	hasMore?: boolean;
};

/** commits touching the workspace, newest first. */
export async function gitLog(root: string, limit?: number): Promise<GitLogResult> {
	const n = nativeBridge();
	if (!n?.gitLog) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitLog(root, limit);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

export type GitChangesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	entries?: GitFileChange[];
};

/** what differs between a version and the working copy now - what restoring it would change. */
export async function gitChangesSince(root: string, hash: string): Promise<GitChangesResult> {
	const n = nativeBridge();
	if (!n?.gitChangesSince) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitChangesSince(root, hash);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** a file's contents at an arbitrary commit, for diffing one version against the working copy. */
export async function gitShowAt(path: string, ref: string): Promise<GitShowResult> {
	const n = nativeBridge();
	if (!n?.gitShowAt) return { ok: false, hasHead: false, error: NO_BRIDGE };
	try {
		return await n.gitShowAt(path, ref);
	} catch (e) {
		return { ok: false, hasHead: false, error: errMsg(e) };
	}
}

/** `untracked`: new files, in no version, that the restore refused to replace (absolute paths) */
export type GitRestoreResult = GitOpResult & { untracked?: string[]; failure?: 'same' };

/** roll the workspace back to a commit, recorded as a new commit rather than a reset. */
export async function gitRestore(root: string, hash: string, message: string): Promise<GitRestoreResult> {
	const n = nativeBridge();
	if (!n?.gitRestore) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitRestore(root, hash, message);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** the uncommitted files a restore to `hash` would rewrite, and anything staged (absolute) */
export async function gitRestoreInTheWay(root: string, hash: string): Promise<GitOpResult & { files?: string[] }> {
	const n = nativeBridge();
	if (!n?.gitRestoreInTheWay) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitRestoreInTheWay(root, hash);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** why an upload did not happen; the panel turns each into a different sentence. 'cancelled' is
 *  the author closing the sign-in prompt, which is not reported as a failure at all. */
/** 'secret': GitHub's push protection found what looks like a password or key in a version;
 *  'protected': the branch only takes changes a rule allows */
export type PushFailure = 'no-upstream' | 'rejected' | 'auth' | 'forbidden' | 'secret' | 'protected' | 'network' | 'cancelled' | 'other';

export type GitPushResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	failure?: PushFailure;
	/** the remote it went to, or would have */
	remote?: string;
};

/** send this branch's versions to the upstream it already tracks. Never fetches or merges. */
export async function gitPush(root: string): Promise<GitPushResult> {
	const n = nativeBridge();
	if (!n?.gitPush) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitPush(root);
	} catch (e) {
		return { ok: false, failure: 'other', error: errMsg(e) };
	}
}

/** write the identity commits are made with to the global git config; an empty field is left as it was */
export async function gitSetIdentity(root: string, name: string, email: string): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n?.gitSetIdentity) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitSetIdentity(root, name, email);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** the name and email git will put on a commit; null where unset, or where it cannot be read */
export async function gitIdentity(root: string): Promise<{ name: string | null; email: string | null }> {
	try {
		const res = await nativeBridge()?.gitIdentity?.(root);
		return { name: res?.name ?? null, email: res?.email ?? null };
	} catch {
		return { name: null, email: null };
	}
}

export type GitRemote = { name: string; url: string };

export type GitRemotesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	remotes?: GitRemote[];
	/** the opened folder is the repository's top level, not a folder inside it */
	atTopLevel?: boolean;
};

export async function gitRemotes(root: string): Promise<GitRemotesResult> {
	const n = nativeBridge();
	if (!n?.gitRemotes) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitRemotes(root);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

export async function gitAddRemote(root: string, name: string, url: string): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n?.gitAddRemote) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitAddRemote(root, name, url);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** send this branch to `remote` and make it the upstream (push -u) */
export async function gitPublish(root: string, remote: string): Promise<GitPushResult> {
	const n = nativeBridge();
	if (!n?.gitPublish) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitPublish(root, remote);
	} catch (e) {
		return { ok: false, failure: 'other', error: errMsg(e) };
	}
}

/** 'conflict': both sides changed the same lines and the attempt was undone. 'dirty': unsaved work
 *  is in the way and nothing was tried. */
export type SyncFailure = PushFailure | 'conflict' | 'dirty';

export type GitSyncResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	failure?: SyncFailure;
	remote?: string;
	/** versions taken in from the remote */
	pulled?: number;
	/** versions sent to it */
	pushed?: number;
	/** repo-relative paths behind a 'conflict' or a 'dirty' */
	files?: string[];
};

/** fetch, merge the upstream, push this branch. `message` is the merge commit's; without one,
 *  git's own ("Merge remote-tracking branch 'origin/main'"), as VS Code's Sync leaves it */
export async function gitSync(root: string, message = ''): Promise<GitSyncResult> {
	const n = nativeBridge();
	if (!n?.gitSync) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitSync(root, message);
	} catch (e) {
		return { ok: false, failure: 'other', error: errMsg(e) };
	}
}

export type GithubPublishResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	/** signing in, creating the repository ('exists', 'scope'), or the upload after it */
	failure?: PushFailure | 'exists' | 'scope';
	error?: string;
	remote?: string;
	/** the repository's page, once it exists */
	url?: string;
	fullName?: string;
};

/** create a GitHub repository, add it as `remote`, and publish this branch to it */
export async function githubPublish(
	root: string,
	opts: { name: string; isPrivate: boolean; remote: string }
): Promise<GithubPublishResult> {
	const n = nativeBridge();
	if (!n?.githubPublish) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.githubPublish(root, opts);
	} catch (e) {
		return { ok: false, failure: 'other', error: errMsg(e) };
	}
}

/** The preload's remote half (electron/src/preload.ts). Optional throughout: an older preload
 *  predates it, and the client degrades to no publishing, sync or sign-in prompts. */
export type GitRemoteBridge = {
	gitRecheck?: () => Promise<GitOpResult>;
	gitSetIdentity?: (root: string, name: string, email: string) => Promise<GitOpResult>;
	gitRemotes?: (root: string) => Promise<GitRemotesResult>;
	gitAddRemote?: (root: string, name: string, url: string) => Promise<GitOpResult>;
	gitPublish?: (root: string, remote: string) => Promise<GitPushResult>;
	gitSync?: (root: string, message?: string) => Promise<GitSyncResult>;
	githubPublish?: (root: string, opts: { name: string; isPrivate: boolean; remote: string }) => Promise<GithubPublishResult>;
	onGitAskpass?: (cb: (req: GitAskpassRequest) => void) => () => void;
	onGitAskpassClosed?: (cb: (ids: number[]) => void) => () => void;
	gitAskpassReply?: (id: number, answer: string | null) => Promise<boolean>;
	gitForgetSignIns?: () => Promise<boolean>;
};

/** one question git or ssh asked on the way to a remote (electron/src/git/auth/gitAskpassClient.ts) */
export type GitAskpassRequest = {
	id: number;
	input: 'text' | 'secret' | 'confirm';
	subject: 'username' | 'password' | 'passphrase' | 'host-key' | 'other';
	prompt: string;
	host: string | null;
	/** a github.com question that signing in to GitHub in the browser can answer (githubSignIn.ts) */
	github?: boolean;
};

/** drop the sign-ins Texpile kept in the keychain; false where there is no desktop bridge */
export async function gitForgetSignIns(): Promise<boolean> {
	try {
		return !!(await nativeBridge()?.gitForgetSignIns?.());
	} catch {
		return false;
	}
}

/** forget that git was missing: "Check again" after installing it */
export async function gitRecheck(): Promise<void> {
	try {
		await nativeBridge()?.gitRecheck?.();
	} catch {
		// the status refresh that follows says whether it worked
	}
}
