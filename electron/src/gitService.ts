// git backing for the Source Control panel. Kept out of fsService.ts so that module stays
// dependency-free; every function returns { ok, reason|error } and never throws
import { simpleGit, type SimpleGit, type FileStatusResult } from 'simple-git';
import { dirname, resolve, relative, join, isAbsolute } from 'node:path';

// once git is confirmed missing (ENOENT), stop retrying
let gitBinaryMissing = false;

// repo membership doesn't change while a folder is open, except git init, which clears this
const repoRootCache = new Map<string, string | null>();

export type GitStatusEntry = {
	/** absolute path, built to match the file-tree's own path strings (fsService join()). */
	path: string;
	/** index (staged) status char, e.g. 'M'/'A'/'D'/'R'; ' ' if not staged, '?' if untracked. */
	x: string;
	/** working-dir (unstaged) status char; ' ' if clean, '?' if untracked. */
	y: string;
};

export type GitStatusResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
	branch?: string | null;
	entries?: GitStatusEntry[];
	/** the upstream this branch tracks ('origin/master'), or null if it tracks nothing */
	tracking?: string | null;
	/** versions here the upstream does not have. Read from local refs, so it costs no network and
	 *  cannot be stale; `behind` is the same read and is therefore only as fresh as the last fetch. */
	ahead?: number;
	behind?: number;
};

export type GitShowResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
	/** false when the file has no committed baseline (unborn HEAD, or an untracked/new file);
	 *  the caller diffs against empty content. */
	hasHead: boolean;
	content?: string;
};

export type GitOpResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
};

function git(baseDir: string): SimpleGit {
	return simpleGit({
		baseDir,
		binary: 'git',
		maxConcurrentProcesses: 4,
		timeout: { block: 20000 },
		// git octal-escapes any non-ASCII path it prints, which then matches no file on disk. On the
		// factory, so it covers the output simple-git parses itself too.
		config: ['core.quotePath=false']
	});
}

function isMissingGit(e: unknown): boolean {
	if ((e as { code?: string })?.code === 'ENOENT') return true;
	const msg = e instanceof Error ? e.message : String(e);
	return /ENOENT|not recognized as|command not found|is not recognized/i.test(msg);
}

function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** resolves the enclosing repo's root, cached. Flat shape (root|null + optional reason), not a
 *  discriminated union: the union form tripped svelte-check's cross-config narrowing. */
async function resolveRepoRoot(dir: string): Promise<{ root: string | null; reason?: 'not-a-repo' | 'no-git' }> {
	if (gitBinaryMissing) return { root: null, reason: 'no-git' };
	// case-fold the cache key only on case-insensitive filesystems; on Linux /proj/Foo
	// and /proj/foo are different directories and must not collide
	const abs = resolve(dir);
	const key = process.platform === 'win32' || process.platform === 'darwin' ? abs.toLowerCase() : abs;
	const cached = repoRootCache.get(key);
	if (cached !== undefined) {
		return cached ? { root: cached } : { root: null, reason: 'not-a-repo' };
	}
	try {
		const g = git(dir);
		// checkIsRepo returns false for a non-repo; it throws ENOENT if git is absent
		if (!(await g.checkIsRepo())) {
			repoRootCache.set(key, null);
			return { root: null, reason: 'not-a-repo' };
		}
		const root = (await g.revparse(['--show-toplevel'])).trim();
		repoRootCache.set(key, root);
		return { root };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { root: null, reason: 'no-git' };
		}
		// permissions or a corrupt repo: treat as not-a-repo but don't cache, could be transient
		return { root: null, reason: 'not-a-repo' };
	}
}

/** absolute paths to repo-root-relative, forward-slashed (what git's pathspecs want). */
function toRepoRel(repoRoot: string, absPaths: string[]): string[] {
	return absPaths.map((p) => relative(repoRoot, resolve(p)).split(/[\\/]/).join('/'));
}

/** status of every changed file under the workspace + the current branch. Paths are re-derived
 *  against the workspace root to match the file-tree's paths byte-for-byte, which keeps it correct
 *  when the workspace is a subdirectory of a larger repo. */
export async function gitStatus(workspaceRoot: string): Promise<GitStatusResult> {
	if (!workspaceRoot) return { ok: false, error: 'Missing path' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	const repoRoot = rr.root;
	try {
		const status = await git(workspaceRoot).status(['--untracked-files=all']);
		const wsAbs = resolve(workspaceRoot);
		const entries: GitStatusEntry[] = [];
		for (const f of status.files as FileStatusResult[]) {
			const absFromRepo = resolve(repoRoot, f.path);
			// '' = the workspace root itself; '..'-prefixed = above it; absolute = a different drive
			const rel = relative(wsAbs, absFromRepo);
			if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue;
			entries.push({ path: join(workspaceRoot, rel), x: f.index, y: f.working_dir });
		}
		return { ok: true, branch: status.current, entries, tracking: status.tracking ?? null, ahead: status.ahead, behind: status.behind };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, reason: 'no-git' };
		}
		return { ok: false, error: errMsg(e) };
	}
}

/** committed (HEAD) contents of a file, for diffing against the working copy. */
export async function gitShowHead(absPath: string): Promise<GitShowResult> {
	if (!absPath) return { ok: false, hasHead: false, error: 'Missing path' };
	const rr = await resolveRepoRoot(dirname(absPath));
	if (!rr.root) return { ok: false, hasHead: false, reason: rr.reason };
	const repoRoot = rr.root;
	try {
		const [rel] = toRepoRel(repoRoot, [absPath]);
		const content = await git(repoRoot).show([`HEAD:${rel}`]);
		return { ok: true, hasHead: true, content };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, hasHead: false, reason: 'no-git' };
		}
		const msg = errMsg(e);
		// unborn HEAD, untracked file, or path not in HEAD: no baseline, not an error
		if (/exists on disk, but not in|does not exist in|unknown revision|bad revision|invalid object name|ambiguous argument/i.test(msg)) {
			return { ok: true, hasHead: false, content: '' };
		}
		return { ok: false, hasHead: false, error: msg };
	}
}

/** git init the folder; clears the repo-root cache so subsequent status calls see the new repo. */
export async function gitInit(dir: string): Promise<GitOpResult> {
	if (!dir) return { ok: false, error: 'Missing path' };
	if (gitBinaryMissing) return { ok: false, reason: 'no-git' };
	try {
		await git(dir).init();
		repoRootCache.clear();
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, reason: 'no-git' };
		}
		return { ok: false, error: errMsg(e) };
	}
}

/** stage files (git add). Empty `paths` stages everything under the workspace. */
export async function gitStage(workspaceRoot: string, paths: string[]): Promise<GitOpResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	try {
		const rel = toRepoRel(rr.root, paths);
		await git(rr.root).add(rel.length ? rel : ['.']);
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/** unstage files (git reset HEAD). Falls back to `git rm --cached` before the first commit,
 *  since an unborn HEAD can't be reset against. Empty `paths` unstages everything. */
export async function gitUnstage(workspaceRoot: string, paths: string[]): Promise<GitOpResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	const g = git(rr.root);
	const rel = toRepoRel(rr.root, paths);
	try {
		await g.raw(['reset', '-q', 'HEAD', '--', ...(rel.length ? rel : ['.'])]);
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		// no commits yet: reset can't resolve HEAD, remove from the index instead
		try {
			await g.raw(['rm', '-q', '--cached', '-r', '--', ...(rel.length ? rel : ['.'])]);
			return { ok: true };
		} catch (e2) {
			return { ok: false, error: errMsg(e2) };
		}
	}
}

/** discard unstaged changes to tracked files (git checkout). Untracked-file deletion is the
 *  caller's job, via the fs service. */
export async function gitDiscard(workspaceRoot: string, paths: string[]): Promise<GitOpResult> {
	if (!paths.length) return { ok: false, error: 'No files to discard' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	try {
		const rel = toRepoRel(rr.root, paths);
		await git(rr.root).raw(['checkout', '-q', '--', ...rel]);
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/**
 * The repo's configured author name, for attributing review comments.
 *
 * Reads the same `user.name` a commit would, so a comment and a commit from the same person carry
 * the same name and nobody has to be told twice who they are. Returns null for every failure -
 * no git, not a repo, name unset - because the caller has its own fallbacks and none of those is
 * an error worth surfacing.
 */
export async function gitUserName(workspaceRoot: string): Promise<{ ok: true; name: string | null }> {
	if (!workspaceRoot || gitBinaryMissing) return { ok: true, name: null };
	try {
		// --get walks the whole config chain (local, global, system), which is what makes this work
		// in a repo whose author is set once, machine-wide
		const name = (await git(workspaceRoot).raw(['config', '--get', 'user.name'])).trim();
		return { ok: true, name: name || null };
	} catch (e) {
		if (isMissingGit(e)) gitBinaryMissing = true;
		return { ok: true, name: null };
	}
}

/** commit the staged changes. Fails if nothing is staged or no author identity is configured. */
export async function gitCommit(workspaceRoot: string, message: string): Promise<GitOpResult> {
	if (!message || !message.trim()) return { ok: false, error: 'A commit message is required' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	try {
		await git(rr.root).commit(message);
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

// ── history ────────────────────────────────────────────────────────────────────

/** by absolute path; status narrowed to the letters a badge exists for */
export type GitFileChange = { path: string; status: 'A' | 'M' | 'D' | 'R' };

export type GitLogEntry = {
	hash: string;
	/** abbreviated hash, as git chose to abbreviate it */
	short: string;
	subject: string;
	author: string;
	/** author date, ISO 8601 */
	date: string;
	/** two or more is a merge, which the rail has to mark: git log flattens a branching history
	 *  into one date-ordered list and the lane through it claims a succession that is not there */
	parentCount: number;
};

export type GitLogResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
	entries?: GitLogEntry[];
	/** the history is longer than what was asked for, so `entries` is the newest slice of it */
	hasMore?: boolean;
};

// the only two bytes git will not emit inside a subject or an author name
const REC = '\x00';
const FIELD = '\x1f';

// The same bytes as git's own escapes, for the ARGUMENT side: argv is NUL-terminated, so a
// literal NUL there makes Node refuse to spawn - it throws before git runs, and every call comes
// back failed, which reads in the panel as a repo nobody has committed to.
const REC_FMT = '%x00';
const FIELD_FMT = '%x1f';

/** exported for the tests: the delimiters are the whole reason this parses */
export function parseGitLog(raw: string): GitLogEntry[] {
	const entries: GitLogEntry[] = [];
	for (const chunk of raw.split(REC)) {
		if (!chunk.trim()) continue;
		const [hash, short, author, date, parents, ...subjectParts] = chunk.trim().split(FIELD);
		if (!hash) continue;
		entries.push({
			hash,
			short: short ?? '',
			author: author ?? '',
			date: date ?? '',
			// %P is space-separated, and empty for a root commit
			parentCount: (parents ?? '').trim() ? (parents ?? '').trim().split(/\s+/).length : 0,
			subject: subjectParts.join(FIELD).trim()
		});
	}
	return entries;
}

/** a letter, a tab, a path - or two paths when it is a rename. Repo-relative, as git printed them. */
export function parseNameStatus(raw: string): GitFileChange[] {
	const out: GitFileChange[] = [];
	for (const line of raw.split('\n')) {
		if (!line.trim()) continue;
		const [code, ...paths] = line.split('\t');
		if (!code || !paths.length) continue;
		// R and C carry a similarity score (R100)
		const letter = code[0].toUpperCase();
		// old then new; the new one is what exists to open
		const path = paths[paths.length - 1].trim();
		if (!path) continue;
		if (letter === 'D') out.push({ path, status: 'D' });
		else if (letter === 'R') out.push({ path, status: 'R' });
		else if (letter === 'A' || letter === 'C') out.push({ path, status: 'A' });
		else out.push({ path, status: 'M' });
	}
	return out;
}

/** Newest first, scoped to the workspace subtree. Asks for one more than it returns - that is
 *  how hasMore is known - because a truncated list reads as the project's first version. */
export async function gitLog(workspaceRoot: string, limit = 100): Promise<GitLogResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	const want = Math.max(1, Math.min(limit, 2000));
	try {
		// repo-relative and forward-slashed, or a Windows path matches nothing and the history comes
		// back silently empty. Empty means the workspace IS the root, where a pathspec would narrow it.
		const [rel] = toRepoRel(rr.root, [workspaceRoot]);
		const raw = await git(rr.root).raw([
			'log',
			`--max-count=${want + 1}`,
			`--format=${REC_FMT}%H${FIELD_FMT}%h${FIELD_FMT}%an${FIELD_FMT}%aI${FIELD_FMT}%P${FIELD_FMT}%s`,
			...(rel ? ['--', rel] : [])
		]);
		const all = parseGitLog(raw);
		return { ok: true, entries: all.slice(0, want), hasMore: all.length > want };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, reason: 'no-git' };
		}
		// an unborn HEAD has no log, which is a valid empty history rather than a failure
		if (/does not have any commits yet|unknown revision|bad revision/i.test(errMsg(e))) return { ok: true, entries: [] };
		return { ok: false, error: errMsg(e) };
	}
}

export type GitChangesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
	entries?: GitFileChange[];
};

/** What differs from a version NOW, not what it changed: every row then opens a diff with
 *  something in it. Untracked files are absent by design - they postdate every version. */
export async function gitChangesSince(workspaceRoot: string, hash: string): Promise<GitChangesResult> {
	if (!hash) return { ok: false, error: 'Missing revision' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	try {
		const [rel] = toRepoRel(rr.root, [workspaceRoot]);
		// `diff <commit>` is commit -> working tree, so the letters read as "since that version":
		// A is a file that did not exist then, D one that has gone since
		const raw = await git(rr.root).raw(['diff', '--name-status', hash, ...(rel ? ['--', rel] : [])]);
		// git prints from the REPO root; the renderer deals only in absolute paths inside the folder
		const wsAbs = resolve(workspaceRoot);
		const entries = parseNameStatus(raw)
			.map((f) => ({ ...f, path: resolve(rr.root as string, f.path) }))
			.filter((f) => {
				const inside = relative(wsAbs, f.path);
				return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside);
			});
		return { ok: true, entries };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, reason: 'no-git' };
		}
		return { ok: false, error: errMsg(e) };
	}
}

/** a file's contents at an arbitrary commit, for diffing a version against the working copy. */
export async function gitShowAt(absPath: string, ref: string): Promise<GitShowResult> {
	if (!absPath) return { ok: false, hasHead: false, error: 'Missing path' };
	if (!ref) return { ok: false, hasHead: false, error: 'Missing revision' };
	const rr = await resolveRepoRoot(dirname(absPath));
	if (!rr.root) return { ok: false, hasHead: false, reason: rr.reason };
	try {
		const [rel] = toRepoRel(rr.root, [absPath]);
		const content = await git(rr.root).show([`${ref}:${rel}`]);
		return { ok: true, hasHead: true, content };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, hasHead: false, reason: 'no-git' };
		}
		const msg = errMsg(e);
		// the file simply did not exist at that revision: an empty baseline, not an error
		if (/exists on disk, but not in|does not exist in|unknown revision|bad revision|invalid object name|ambiguous argument/i.test(msg)) {
			return { ok: true, hasHead: false, content: '' };
		}
		return { ok: false, hasHead: false, error: msg };
	}
}

/**
 * Roll the workspace back to `hash` by writing that version FORWARD as a new commit, so the
 * restore is itself an ordinary history entry and can be undone by restoring the one above it.
 * Nothing is ever rewound out of existence and no reset is involved.
 *
 * Refuses while the tree is dirty: overwriting uncommitted work is the one way this could lose
 * something git could not give back, so the caller saves a version first.
 */
export async function gitRestore(workspaceRoot: string, hash: string, message: string): Promise<GitOpResult> {
	if (!hash) return { ok: false, error: 'Missing revision' };
	if (!message || !message.trim()) return { ok: false, error: 'A message is required' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	const repoRoot = rr.root;
	try {
		const g = git(repoRoot);
		const dirty = await g.status(['--untracked-files=no']);
		if (dirty.files.length) return { ok: false, error: 'Save a version first: there are unsaved changes.' };

		// repo-relative and forward-slashed, for the same reason as in gitLog: a backslashed
		// absolute pathspec matches nothing and the restore would find no files to change
		const [scope] = toRepoRel(repoRoot, [workspaceRoot]);
		// every path that differs between the target and now, so files ADDED since the target are
		// found too. Without this pass they would survive the restore and the result would be a
		// version that never existed.
		const changed = (await g.raw(['diff', '--name-only', hash, 'HEAD', ...(scope ? ['--', scope] : [])]))
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);
		if (!changed.length) return { ok: false, error: 'That version matches the current one.' };

		for (const rel of changed) {
			try {
				await g.raw(['checkout', hash, '--', rel]);
			} catch {
				// absent at the target revision: it was added afterwards, so restoring means removing it
				await g.raw(['rm', '-f', '--ignore-unmatch', '--', rel]);
			}
		}
		await g.commit(message);
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

// -- upload ---------------------------------------------------------------------

/** Why a push did not happen. 'failed to push some refs' is the same sentence for all of them and
 *  the difference is the only part an author can act on. */
export type PushFailure = 'no-upstream' | 'rejected' | 'auth' | 'network' | 'other';

export type GitPushResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
	failure?: PushFailure;
	/** the remote it went to, or would have, so the message can name it */
	remote?: string;
};

// checked in this order: a 403 from a host says both 'unable to access' and a permissions phrase,
// and it is an authentication problem, not a network one
const AUTH_RE =
	/authentication failed|could not read (username|password)|invalid username or password|permission denied|permission to .* denied|terminal prompts disabled|returned error: 40[13]|access denied|no such identity|host key verification failed/i;
const REJECTED_RE = /non-fast-forward|fetch first|updates were rejected|\[rejected\]|behind its remote/i;
const NETWORK_RE =
	/could not resolve host|connection (timed out|refused|reset)|network is unreachable|failed to connect|operation timed out|unable to access|proxy/i;

/** exported for the tests: this is the whole difference between a message worth reading and one
 *  that sends an author to a search engine */
export function classifyPushError(message: string): PushFailure {
	if (AUTH_RE.test(message)) return 'auth';
	if (REJECTED_RE.test(message)) return 'rejected';
	if (NETWORK_RE.test(message)) return 'network';
	return 'other';
}

/** Push waits on things nothing else here does: a credential dialog someone has to type into, and
 *  an upload over their connection. The shared factory kills a command after 20s of silence, which
 *  is exactly what a password prompt looks like from the outside, so this one has no block timeout.
 *
 *  GIT_TERMINAL_PROMPT=0 because there is no terminal to prompt on: without it a repo with no
 *  credential helper hangs for ever on a question nobody can see. Credential managers go through
 *  git's credential API instead and still work. */
function pushGit(baseDir: string): SimpleGit {
	// one name, not a spread of process.env: simple-git rejects an environment containing any of
	// EDITOR, PAGER, PREFIX and a dozen others, and npm sets PREFIX - so passing the whole
	// environment through works on the machine you tried it on and fails on someone else's
	return simpleGit({ baseDir, binary: 'git', maxConcurrentProcesses: 1, config: ['core.quotePath=false'] }).env('GIT_TERMINAL_PROMPT', '0');
}

/**
 * Send this branch's versions to the upstream it already tracks.
 *
 * Push only, deliberately: it never fetches, merges or rebases, so it cannot rewrite anyone's
 * files. A remote that has moved on is reported and left alone, because combining two histories
 * is a different feature with a different failure mode.
 */
export async function gitPush(workspaceRoot: string): Promise<GitPushResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.root) return { ok: false, reason: rr.reason };
	let remote: string | undefined;
	try {
		const g = pushGit(rr.root);
		const status = await g.status();
		// a branch tracking nothing has nowhere to go, and inventing a remote is a different feature
		if (!status.tracking || !status.current) return { ok: false, failure: 'no-upstream' };
		const [name, ...rest] = status.tracking.split('/');
		remote = name;
		// explicit refspec: `git push` alone refuses when the upstream branch is named differently
		await g.push(name, `${status.current}:${rest.join('/')}`);
		return { ok: true, remote };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		const msg = errMsg(e);
		return { ok: false, failure: classifyPushError(msg), error: msg, remote };
	}
}
