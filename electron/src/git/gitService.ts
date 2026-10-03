// git backing for the Source Control panel. Kept out of fsService.ts so that module stays
// dependency-free; every function returns { ok, reason|error } and never throws
import { simpleGit, type SimpleGit } from 'simple-git';
import { dirname, resolve, join, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { open, readFile, type FileHandle } from 'node:fs/promises';
import { unsafeRepoFrom } from './unsafeRepo';
import { FOLDER_ROW_AT, capRows, collapseUntracked } from './gitStatusLimit';
import { hasConflictMarkers } from './history/conflictMarkers';
import { literal } from './gitProcessEnv';
import { runInChunks } from './gitCommandLine';
import { locateRepo, type RepoPaths } from './gitRepoPaths';
import { statusOf } from './gitStatusParse';

// once git is confirmed missing (ENOENT), stop retrying
let gitBinaryMissing = false;

// A folder that is its own repo root stays one, so that hit is cached for good. A MISS is not:
// `git init` in a terminal made a folder a repo and the cached "no" kept the panel saying it was
// not under source control for the rest of the session. Nor is a root ABOVE the folder: a `git init`
// or a clone in the folder itself makes it a repository of its own, and the cached parent put every
// row outside the folder, where it was dropped, and every save committed nothing. Short enough to
// self-heal, long enough that the status polling does not spawn a checkIsRepo every time.
const RECHECK_MS = 5000;
const repoRootCache = new Map<string, { repo: RepoPaths | null; at: number }>();

// a repository's git directory, by repo root: where MERGE_HEAD and friends live (not always
// <root>/.git - a worktree or a submodule keeps it elsewhere)
const gitDirCache = new Map<string, { gitDir: string; commonDir: string }>();

export type GitStatusEntry = {
	/** absolute path, built to match the file-tree's own path strings (fsService join()). */
	path: string;
	/** index (staged) status char, e.g. 'M'/'A'/'D'/'R'; ' ' if not staged, '?' if untracked. */
	x: string;
	/** working-dir (unstaged) status char; ' ' if clean, '?' if untracked. */
	y: string;
	/** a file both sides changed that still holds a place marked for someone to choose. Only set
	 *  on those files: once every place is chosen it is ready to finish the merge with. */
	markers?: boolean;
	/** a file both sides changed that is settled by keeping one whole side: why (wholeFileChoice) */
	choose?: WholeFileChoice;
	/** a rename's old path, absolute: saving the rename takes in both, putting it back restores this */
	from?: string;
	/** a folder row that also holds files .gitignore leaves out, or a repository of its own: never
	 *  deleted as a whole */
	ignoredInside?: boolean;
	/** a folder of new files shown as one row (gitStatusLimit.ts): how many files it holds */
	files?: number;
};

export type GitStatusResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	/** reason 'unsafe': the repository git will not work in, as git names it */
	unsafe?: string;
	error?: string;
	/** the list was cut (gitStatusLimit.ts MAX_ROWS): how many rows there were */
	truncated?: number;
	branch?: string | null;
	entries?: GitStatusEntry[];
	/** the upstream this branch tracks ('origin/master'), or null if it tracks nothing */
	tracking?: string | null;
	/** versions here the upstream does not have. Read from local refs, so it costs no network and
	 *  cannot be stale; `behind` is the same read and is therefore only as fresh as the last fetch. */
	ahead?: number;
	behind?: number;
	/** false before the first version: there is nothing to publish yet. Only read when the branch
	 *  tracks nothing, since a tracked branch has commits by definition. */
	hasCommits?: boolean;
	/** HEAD is a commit rather than a branch, so there is no branch to publish or sync */
	detached?: boolean;
	/** the commit HEAD points at ('' before the first); when it moves, History is stale */
	head?: string;
	/** git is part-way through combining histories, started by Sync or in a terminal: until it is
	 *  finished or cancelled, a Save version would record it half-done */
	operation?: GitOperation | null;
	/** where the repository starts: the folder itself, or one above it */
	repoRoot?: string;
};

export type GitOperation = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

export type GitShowResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	/** false when the file has no committed baseline (unborn HEAD, or an untracked/new file);
	 *  the caller diffs against empty content. */
	hasHead: boolean;
	content?: string;
};

export type GitOpResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
};

/** exported for gitRemote.ts, like the three below. `block`: how long a command may say nothing
 *  before it is taken for hung and killed; 0 for never (patientGit) */
export function git(baseDir: string, block = 20000): SimpleGit {
	return simpleGit({
		baseDir,
		binary: 'git',
		maxConcurrentProcesses: 4,
		...(block > 0 && { timeout: { block } }),
		// git octal-escapes any non-ASCII path it prints, which then matches no file on disk. On the
		// factory, so it covers the output simple-git parses itself too.
		// log.showSignature: an author's `true` puts gpg's words ("No signature") in the log's output,
		// where they parsed as a version of their own.
		// core.fsmonitor: a project that arrives with its own .git/config can name a program for every
		// status to run, and opening the folder reads its status; the monitor only ever saves time
		config: ['core.quotePath=false', 'log.showSignature=false', 'core.fsmonitor=false'],
		// simple-git refuses any core.fsmonitor, since one naming a program runs it; this one turns it off
		unsafe: { allowUnsafeFsMonitor: true }
	});
}

/** For a command that may run the author's own programs and wait on them: a hook, a signing prompt
 *  (gpg's pinentry), a filter such as Git LFS's download. 20 seconds of that silence was taken for
 *  a hang and the commit, merge or checkout killed part-way, so this has no block timeout, as
 *  netGit in gitRemote.ts has none. */
export function patientGit(baseDir: string): SimpleGit {
	return git(baseDir, 0);
}

// another git holds the lock: a terminal, another editor's own status poll. Texpile's own status
// takes no lock (GIT_OPTIONAL_LOCKS in gitProcessEnv.ts), but it cannot speak for them.
const LOCKED_RE = /index\.lock|unable to create '[^']*\.lock'|cannot lock ref/i;
// "cannot lock ref 'refs/heads/draft/v2': 'refs/heads/draft' exists": a name clash, which no wait fixes
const NAME_CLASH_RE = /exists; cannot create|cannot lock ref '[^']*': '[^']*' exists/i;

export function isLocked(e: unknown): boolean {
	const msg = errMsg(e);
	return LOCKED_RE.test(msg) && !isNameClash(msg);
}

/** a branch name that another one's name is in the way of ("draft" and "draft/v2") */
export function isNameClash(msg: string): boolean {
	return NAME_CLASH_RE.test(msg);
}

/**
 * Again while the repository is locked, as VS Code retries every operation: up to ten more times,
 * waiting 50 ms, 200, 450 ... (the attempt squared, times 50), about 19 seconds in all. A lock is
 * usually another git finishing its own write.
 */
export async function retryLocked<T>(run: () => Promise<T>): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (e) {
			if (attempt > 10 || !isLocked(e)) throw e;
			await new Promise((r) => setTimeout(r, attempt * attempt * 50));
		}
	}
}

/** git itself could not be started. Only the spawn failing says so: a hook or a filter that runs a
 *  missing tool prints "command not found" too, and that is the hook's problem to report, not git's */
export function isMissingGit(e: unknown): boolean {
	if ((e as { code?: string })?.code === 'ENOENT') return true;
	const msg = e instanceof Error ? e.message : String(e);
	return /\bspawn\s+\S*git(?:\.exe)?\s+ENOENT\b/i.test(msg);
}

export function errMsg(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

/** the enclosing repository, as seen from `dir`, cached. Flat shape (repo|null + optional reason), not
 *  a discriminated union: the union form tripped svelte-check's cross-config narrowing. */
export async function resolveRepoRoot(
	dir: string
): Promise<{ repo: RepoPaths | null; reason?: 'not-a-repo' | 'no-git' | 'unsafe'; unsafe?: string }> {
	if (gitBinaryMissing) return { repo: null, reason: 'no-git' };
	// by the exact spelling: rows are spelled under the folder as it was opened
	const abs = resolve(dir);
	const cached = repoRootCache.get(abs);
	if (cached && (cached.repo?.root === abs || Date.now() - cached.at < RECHECK_MS))
		return cached.repo ? { repo: cached.repo } : { repo: null, reason: 'not-a-repo' };
	try {
		const g = git(dir);
		// checkIsRepo returns false for a non-repo; it throws ENOENT if git is absent
		if (!(await g.checkIsRepo())) {
			repoRootCache.set(abs, { repo: null, at: Date.now() });
			return { repo: null, reason: 'not-a-repo' };
		}
		// git names the top level by its physical path (macOS /var, a linked home, a link inside the
		// repository), so where the folder sits is read from the prefix instead. Not trimmed: a folder
		// name may start with a space.
		const prefix = (await g.raw(['rev-parse', '--show-prefix'])).replace(/\r?\n$/, '');
		const repo = await locateRepo(abs, prefix);
		repoRootCache.set(abs, { repo, at: Date.now() });
		return { repo };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { repo: null, reason: 'no-git' };
		}
		// a folder another account owns: git will say which, and gitTrust.ts can list it as safe
		const unsafe = unsafeRepoFrom(errMsg(e));
		if (unsafe) return { repo: null, reason: 'unsafe', unsafe };
		// permissions or a corrupt repo: treat as not-a-repo but don't cache, could be transient
		return { repo: null, reason: 'not-a-repo' };
	}
}

/** The repository's git directory, and the common one a worktree shares its refs with. Exported
 *  for the watcher (fs/fsWatch.ts), which follows HEAD, the index and the refs from there. */
export async function gitDirsOf(repoRoot: string): Promise<{ gitDir: string; commonDir: string }> {
	const cached = gitDirCache.get(repoRoot);
	if (cached) return cached;
	const g = git(repoRoot);
	const gitDir = resolve(repoRoot, (await g.raw(['rev-parse', '--git-dir'])).trim());
	const commonDir = resolve(repoRoot, (await g.raw(['rev-parse', '--git-common-dir'])).trim());
	const dirs = { gitDir, commonDir };
	gitDirCache.set(repoRoot, dirs);
	return dirs;
}

/** what git leaves behind while an operation waits for someone to finish it. rebase-apply is also
 *  `git am`, which is the same kind of unfinished for this purpose. */
export function operationIn(gitDir: string): GitOperation | null {
	if (existsSync(join(gitDir, 'rebase-merge')) || existsSync(join(gitDir, 'rebase-apply'))) return 'rebase';
	if (existsSync(join(gitDir, 'MERGE_HEAD'))) return 'merge';
	if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) return 'cherry-pick';
	if (existsSync(join(gitDir, 'REVERT_HEAD'))) return 'revert';
	return null;
}

/** a history or remote call found git missing: stop asking until "Check again" */
export function markGitMissing(): void {
	gitBinaryMissing = true;
}

/** "Check again" after installing git: forget that it was missing, and every repository answer. */
export async function gitRecheck(): Promise<GitOpResult> {
	gitBinaryMissing = false;
	repoRootCache.clear();
	gitDirCache.clear();
	return { ok: true };
}

/** status of every changed file under the workspace + the current branch. Paths are re-derived
 *  against the workspace root to match the file-tree's paths byte-for-byte, which keeps it correct
 *  when the workspace is a subdirectory of a larger repo. */
/** git's unmerged status codes: a U on either side, or both sides adding or deleting the same path */
export function isUnmerged(x: string, y: string): boolean {
	return x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
}

/**
 * A file both sides changed with no places to choose between, only the whole file: one side
 * deleted it, or it is not text (a figure, a PDF), where git leaves your version in place and
 * nothing in it says a choice is waiting. VS Code asks about the first two; a writer's figures are
 * where a silent pick of one side hurts most, so the third is asked about too.
 */
export type WholeFileChoice = 'deleted-by-them' | 'deleted-by-us' | 'binary';

export async function wholeFileChoice(x: string, y: string, abs: string): Promise<WholeFileChoice | null> {
	// git leaves the side that kept the file on disk; gone from there, it was deleted, which is a choice
	if (x === 'U' && y === 'D') return existsSync(abs) ? 'deleted-by-them' : null;
	if (x === 'D' && y === 'U') return existsSync(abs) ? 'deleted-by-us' : null;
	if ((x === 'U' && y === 'U') || (x === 'A' && y === 'A')) return (await looksBinary(abs)) ? 'binary' : null;
	return null;
}

/** git's own test: a NUL byte in the first 8000 */
async function looksBinary(abs: string): Promise<boolean> {
	let file: FileHandle | undefined;
	try {
		file = await open(abs, 'r');
		const head = Buffer.alloc(8000);
		const { bytesRead } = await file.read(head, 0, head.length, 0);
		return head.subarray(0, bytesRead).includes(0);
	} catch {
		return false;
	} finally {
		await file?.close();
	}
}

/** a deleted or unreadable file has nothing marked in it. `rel`, repo-relative, reads each side's
 *  copy of the file (stages 2 and 3) */
export async function stillMarked(g: SimpleGit, rel: string, abs: string): Promise<boolean> {
	let text: string;
	try {
		text = await readFile(abs, 'utf8');
	} catch {
		return false;
	}
	if (!hasConflictMarkers(text)) return false;
	const sides = await Promise.all([':2:', ':3:'].map((stage) => g.show([`${stage}${rel}`]).catch(() => '')));
	return hasConflictMarkers(text, sides);
}

/** big folders of new files as one row each; git is asked which folders are wholly new only when
 *  there are enough new files for one to qualify */
async function withFolderRows(g: SimpleGit, workspaceRoot: string, entries: GitStatusEntry[], repos: string[]): Promise<GitStatusEntry[]> {
	if (entries.filter((e) => e.x === '?').length < FOLDER_ROW_AT) return entries;
	const raw = await g.raw(['ls-files', '--others', '--exclude-standard', '--directory', '--no-empty-directory', '-z']);
	const folders = raw
		.split('\0')
		.filter((p) => p.endsWith('/'))
		.map((p) => join(workspaceRoot, p));
	const rows = collapseUntracked(entries, folders);
	if (!rows.some((r) => r.files)) return rows;
	// git calls a folder wholly new even when it also holds files .gitignore leaves out, or a
	// repository of its own: the row says so, and is not offered for deleting, which would take those too
	const ignored = (await g.raw(['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z']))
		.split('\0')
		.filter(Boolean)
		.map((p) => join(workspaceRoot, p));
	const kept = [...ignored, ...repos];
	return rows.map((r) => (r.files && kept.some((p) => p.startsWith(r.path + sep)) ? { ...r, ignoredInside: true } : r));
}

/** Whether the upstream branch is still there. One deleted on the remote (a merged pull request's
 *  branch, pruned on fetch) is `[gone]`: the branch has nowhere to sync with, and is offered to
 *  publish again, as VS Code does. */
export async function upstreamExists(g: SimpleGit): Promise<boolean> {
	try {
		// -q: a gone upstream exits 1 and prints nothing
		return (await g.raw(['rev-parse', '--verify', '-q', '@{u}'])).trim() !== '';
	} catch {
		return false;
	}
}

export async function gitStatus(workspaceRoot: string): Promise<GitStatusResult> {
	if (!workspaceRoot) return { ok: false, error: 'Missing path' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason, unsafe: rr.unsafe };
	const repo = rr.repo;
	try {
		const g = git(workspaceRoot);
		// `.`, the folder: in a larger repository, the rest of it is scanned for nothing
		const status = await statusOf(g, ['--untracked-files=all', '--', '.']);
		// with -q, an unborn HEAD exits non-zero and prints nothing, which simple-git resolves as ''
		const head = (await g.raw(['rev-parse', '--verify', '-q', 'HEAD'])).trim();
		const operation = operationIn((await gitDirsOf(repo.root)).gitDir);
		const entries: GitStatusEntry[] = [];
		const repos = status.files.filter((f) => f.path.endsWith('/') && repo.holds(f.path)).map((f) => repo.fromGit(f.path));
		for (const f of status.files) {
			// a repository inside this one (a cloned template or class) is 'dir/': not a file of this
			// project's, and one git cannot save as a version without making it a submodule
			if (f.path.endsWith('/') || !repo.holds(f.path)) continue;
			const path = repo.fromGit(f.path);
			const entry: GitStatusEntry = { path, x: f.index, y: f.working_dir };
			if (f.from && f.index === 'R') entry.from = repo.fromGit(f.from);
			if (isUnmerged(f.index, f.working_dir)) {
				// a whole-file choice is still a choice to make: marked until it is made
				const choose = await wholeFileChoice(f.index, f.working_dir, path);
				if (choose) entry.choose = choose;
				entry.markers = !!choose || (await stillMarked(g, f.path, path));
			}
			entries.push(entry);
		}
		const { rows, truncated } = capRows(await withFolderRows(g, workspaceRoot, entries, repos), (e) => isUnmerged(e.x, e.y));
		return {
			ok: true,
			branch: status.current,
			entries: rows,
			truncated,
			tracking: status.tracking && (await upstreamExists(g)) ? status.tracking : null,
			ahead: status.ahead,
			behind: status.behind,
			hasCommits: head !== '',
			detached: status.detached,
			head,
			operation,
			repoRoot: repo.root
		};
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, reason: 'no-git' };
		}
		return { ok: false, error: errMsg(e) };
	}
}

/** the file's folder, or the nearest above it still on disk: a folder deleted since finds no repository */
export function folderOnDisk(absPath: string): string {
	let dir = dirname(absPath);
	while (!existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
	return dir;
}

/** committed (HEAD) contents of a file, for diffing against the working copy. */
export async function gitShowHead(absPath: string): Promise<GitShowResult> {
	if (!absPath) return { ok: false, hasHead: false, error: 'Missing path' };
	const rr = await resolveRepoRoot(folderOnDisk(absPath));
	if (!rr.repo) return { ok: false, hasHead: false, reason: rr.reason };
	const repo = rr.repo;
	try {
		const [rel] = repo.toGit([absPath]);
		const content = await git(repo.root).show([`HEAD:${rel}`, '--']);
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
		const g = git(dir);
		// a branch named `main`, which is what GitHub and VS Code start with, unless the author has
		// chosen a default of their own; git before 2.28 has no -b and names it itself
		const chosen = (await g.raw(['config', '--get', 'init.defaultBranch']).catch(() => '')).trim();
		if (chosen) await g.init();
		else await g.raw(['init', '-b', 'main']).catch(() => g.init());
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

/** Everything under the workspace, as a pathspec: the workspace may be one folder of a larger
 *  repository (a thesis/ beside code/), and "." from the repository root would reach the rest,
 *  unstaging what someone staged there by hand. */
function workspaceScope(repo: RepoPaths): string {
	return repo.scope || '.';
}

/** stage files (git add). Empty `paths` stages everything under the workspace. */
export async function gitStage(workspaceRoot: string, paths: string[]): Promise<GitOpResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const repo = rr.repo;
	try {
		const rel = repo.toGit(paths);
		// `--`: simple-git's add() put none, so "-draft.tex" was an unknown option and a file named -n
		// made the add a dry run. Patient: a filter (Git LFS) reads every byte of a large file first.
		const all = literal(rel.length ? rel : [workspaceScope(repo)]);
		await runInChunks(all, (chunk) => retryLocked(() => patientGit(repo.root).raw(['add', '--', ...chunk])));
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/** unstage files (git reset HEAD). Falls back to `git rm --cached` before the first commit,
 *  since an unborn HEAD can't be reset against. Empty `paths` unstages everything under the workspace. */
export async function gitUnstage(workspaceRoot: string, paths: string[]): Promise<GitOpResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const g = git(rr.repo.root);
	const rel = rr.repo.toGit(paths);
	const all = literal(rel.length ? rel : [workspaceScope(rr.repo)]);
	try {
		await runInChunks(all, (chunk) => retryLocked(() => g.raw(['reset', '-q', 'HEAD', '--', ...chunk])));
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		// Only with no commits yet, where reset has no HEAD to go back to. Any other failure is
		// reported as it is: a reset that lost a race for .git/index.lock against a status refresh
		// used to land here too, and `rm --cached -r .` over a whole repository with history makes
		// the next version delete every file that was not ticked.
		if ((await g.raw(['rev-parse', '--verify', '-q', 'HEAD']).catch(() => 'unknown')).trim() !== '') {
			return { ok: false, error: errMsg(e) };
		}
		try {
			await runInChunks(all, (chunk) => retryLocked(() => g.raw(['rm', '-q', '--cached', '-r', '--', ...chunk])));
			return { ok: true };
		} catch (e2) {
			return { ok: false, error: errMsg(e2) };
		}
	}
}

/** Put tracked files back as they are in the last version (git checkout HEAD), staged or not: the
 *  panel is one list, and a change staged in a terminal or left staged by a failed save is still a
 *  change to throw away. Before the first version, from the index. New files (untracked, or staged
 *  as added) are the caller's to move to the Trash, via the fs service. */
export async function gitDiscard(workspaceRoot: string, paths: string[]): Promise<GitOpResult> {
	if (!paths.length) return { ok: false, error: 'No files to discard' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const root = rr.repo.root;
	try {
		const rel = literal(rr.repo.toGit(paths));
		const head = (await git(root).raw(['rev-parse', '--verify', '-q', 'HEAD'])).trim();
		await runInChunks(rel, (chunk) =>
			retryLocked(() => patientGit(root).raw(['checkout', '-q', ...(head ? ['HEAD'] : []), '--', ...chunk]))
		);
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/**
 * The repo's configured author name and email, for attributing review comments and for showing
 * people which identity git will use.
 *
 * Reads the same `user.name` a commit would, so a comment and a commit from the same person carry
 * the same name and nobody has to be told twice who they are. Returns null for every failure -
 * no git, not a repo, name unset - because the caller has its own fallbacks and none of those is
 * an error worth surfacing.
 */
export async function gitIdentity(workspaceRoot: string): Promise<{ ok: true; name: string | null; email: string | null }> {
	if (!workspaceRoot || gitBinaryMissing) return { ok: true, name: null, email: null };
	const read = async (key: string): Promise<string | null> => {
		try {
			// --get walks the whole config chain (local, global, system), which is what makes this work
			// in a repo whose author is set once, machine-wide
			return (await git(workspaceRoot).raw(['config', '--get', key])).trim() || null;
		} catch (e) {
			if (isMissingGit(e)) gitBinaryMissing = true;
			return null;
		}
	};
	return { ok: true, name: await read('user.name'), email: await read('user.email') };
}

/**
 * Tell git who is committing, for every repository on this machine: the same `--global` the
 * install guide has people type, so a name set here is the name a terminal commit uses too.
 * Only what was given is written; an empty field leaves that setting as it was.
 */
export async function gitSetIdentity(workspaceRoot: string, name: string, email: string): Promise<GitOpResult> {
	if (!workspaceRoot) return { ok: false, error: 'Missing path' };
	if (gitBinaryMissing) return { ok: false, reason: 'no-git' };
	try {
		const g = git(workspaceRoot);
		if (name.trim()) await g.addConfig('user.name', name.trim(), false, 'global');
		if (email.trim()) await g.addConfig('user.email', email.trim(), false, 'global');
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) {
			gitBinaryMissing = true;
			return { ok: false, reason: 'no-git' };
		}
		return { ok: false, error: errMsg(e) };
	}
}
