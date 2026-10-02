// The Source Control panel's history half: the version list, what differs from a version now, a
// file as it was in one, and the two ways a version is written, Save version and Restore. Split
// from gitService.ts, whose repo-root resolution and command factory it shares; the helper process
// serves both (helper/helperWorker.ts).
import type { SimpleGit } from 'simple-git';
import {
	git,
	patientGit,
	isMissingGit,
	errMsg,
	resolveRepoRoot,
	retryLocked,
	markGitMissing,
	folderOnDisk,
	type GitShowResult,
	type GitOpResult
} from '../gitService';
import { literal } from '../gitProcessEnv';
import { runWithPathspecs } from '../gitCommandLine';
import { isOutside, type RepoPaths } from '../gitRepoPaths';
import { statusOf } from '../gitStatusParse';

// ── history ────────────────────────────────────────────────────────────────────

/** by absolute path; status narrowed to the letters a badge exists for. A rename carries the
 *  name it had before in `from`. */
export type GitFileChange = { path: string; status: 'A' | 'M' | 'D' | 'R'; from?: string };

export type GitLogEntry = {
	hash: string;
	/** abbreviated hash, as git chose to abbreviate it */
	short: string;
	subject: string;
	/** the rest of the message after its first line, when it has more */
	body?: string;
	/** in one file's log: the file's path in this version, absolute, when it was named differently */
	path?: string;
	author: string;
	/** author date, ISO 8601 */
	date: string;
	/** two or more is a merge, which the rail has to mark: git log flattens a branching history
	 *  into one date-ordered list and the lane through it claims a succession that is not there */
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

// the only two bytes git will not emit inside a subject or an author name
const REC = '\x00';
const FIELD = '\x1f';
// between a message's first line and the rest of it
const BODY = '\x1e';

// The same bytes as git's own escapes, for the ARGUMENT side: argv is NUL-terminated, so a
// literal NUL there makes Node refuse to spawn - it throws before git runs, and every call comes
// back failed, which reads in the panel as a repo nobody has committed to.
const REC_FMT = '%x00';
const FIELD_FMT = '%x1f';
const BODY_FMT = '%x1e';

/** exported for the tests: the delimiters are the whole reason this parses */
export function parseGitLog(raw: string): GitLogEntry[] {
	const entries: GitLogEntry[] = [];
	for (const chunk of raw.split(REC)) {
		if (!chunk.trim()) continue;
		const [hash, short, author, date, parents, ...rest] = chunk.trim().split(FIELD);
		// the message last, so a separator in it cannot shift the fields before it
		const [subject, ...bodyParts] = rest.join(FIELD).split(BODY);
		if (!hash) continue;
		entries.push({
			hash,
			short: short ?? '',
			author: author ?? '',
			date: date ?? '',
			// %P is space-separated, and empty for a root commit
			parentCount: (parents ?? '').trim() ? (parents ?? '').trim().split(/\s+/).length : 0,
			subject: (subject ?? '').trim(),
			// only when there is one: most versions are a single line
			...(bodyParts.join(BODY).trim() ? { body: bodyParts.join(BODY).trim() } : {})
		});
	}
	return entries;
}

/** `--name-status -z`: a letter, then a path - or two paths, old then new, for a rename or a copy -
 *  each ended by NUL. Repo-relative, as git printed them. -z because without it git wraps a name
 *  holding a quote, a backslash or a tab in quotes and escapes, which then matches no file. */
export function parseNameStatus(raw: string): GitFileChange[] {
	const out: GitFileChange[] = [];
	const parts = raw.split('\0');
	for (let i = 0; i < parts.length;) {
		const code = parts[i++].trim();
		if (!code) continue;
		// R and C carry a similarity score (R100), and name two paths
		const letter = code[0].toUpperCase();
		const two = letter === 'R' || letter === 'C';
		const from = two ? parts[i++] : undefined;
		const path = parts[i++];
		if (!path) continue;
		if (letter === 'D') out.push({ path, status: 'D' });
		else if (letter === 'R') out.push({ path, status: 'R', from });
		else if (letter === 'A' || letter === 'C') out.push({ path, status: 'A' });
		else out.push({ path, status: 'M' });
	}
	return out;
}

/** Newest first, scoped to the workspace subtree. Asks for one more than it returns - that is
 *  how hasMore is known - because a truncated list reads as the project's first version. */
export async function gitLog(workspaceRoot: string, limit = 100): Promise<GitLogResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const want = Math.max(1, Math.min(limit, 2000));
	try {
		// repo-relative and forward-slashed, or a Windows path matches nothing and the history comes
		// back silently empty. Empty means the workspace IS the root, where a pathspec would narrow it.
		const rel = rr.repo.scope;
		const raw = await git(rr.repo.root).raw([
			'log',
			`--max-count=${want + 1}`,
			`--format=${REC_FMT}%H${FIELD_FMT}%h${FIELD_FMT}%an${FIELD_FMT}%aI${FIELD_FMT}%P${FIELD_FMT}%s${BODY_FMT}%b`,
			...(rel ? ['--', ...literal([rel])] : [])
		]);
		const all = parseGitLog(raw);
		return { ok: true, entries: all.slice(0, want), hasMore: all.length > want };
	} catch (e) {
		if (isMissingGit(e)) {
			markGitMissing();
			return { ok: false, reason: 'no-git' };
		}
		// an unborn HEAD has no log, which is a valid empty history rather than a failure
		if (/does not have any commits yet|unknown revision|bad revision/i.test(errMsg(e))) return { ok: true, entries: [] };
		return { ok: false, error: errMsg(e) };
	}
}

/**
 * `git log -z --format=%x01%H --name-only` → each version's hash and the file's name in it,
 * repo-relative. -z so a name outside ASCII (a chapter called 章.tex) comes through as it is, not
 * as git's quoted octal. A version that lists no name (a merge) is left out.
 */
export function parseFileNames(raw: string): Map<string, string> {
	const out = new Map<string, string>();
	let hash = '';
	for (const token of raw.split('\0')) {
		if (token.startsWith('\x01')) hash = token.slice(1).trim();
		else if (hash && token.replace(/^\n/, '') && !out.has(hash)) out.set(hash, token.replace(/^\n/, ''));
	}
	return out;
}

/** One file's versions, newest first, following it across renames: the git half of the Timeline
 *  (VS Code's Git History timeline source, `git log --follow -- <file>`). */
export async function gitFileLog(workspaceRoot: string, path: string, limit = 50): Promise<GitLogResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const repo = rr.repo;
	const root = repo.root;
	const [rel] = repo.toGit([path]);
	if (!rel || isOutside(rel)) return { ok: true, entries: [] };
	const [spec] = literal([rel]);
	// the Timeline asks a page at a time, and again with a larger limit for Load more
	const max = `--max-count=${Math.max(1, Math.min(limit, 2000))}`;
	try {
		const raw = await git(root).raw([
			'log',
			'--follow',
			max,
			`--format=${REC_FMT}%H${FIELD_FMT}%h${FIELD_FMT}%an${FIELD_FMT}%aI${FIELD_FMT}%P${FIELD_FMT}%s${BODY_FMT}%b`,
			'--',
			spec
		]);
		// --follow reaches back past renames, where the file had another name: each version carries
		// the name it had then, or a comparison would look up a path that version never held
		const nameAt = parseFileNames(await git(root).raw(['log', '--follow', '-z', max, '--format=%x01%H', '--name-only', '--', spec]));
		return { ok: true, entries: withNamesThen(parseGitLog(raw), nameAt, rel, repo) };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		// an unborn HEAD, or a file git has never seen: no versions, which is not a failure
		if (/does not have any commits yet|unknown revision|bad revision/i.test(errMsg(e))) return { ok: true, entries: [] };
		return { ok: false, error: errMsg(e) };
	}
}

/** `path` on each version where the file was named other than `rel`. A version git lists no name
 *  for (a merge) had the name of the version before it, so names are carried oldest to newest. */
function withNamesThen(entries: GitLogEntry[], nameAt: Map<string, string>, rel: string, repo: RepoPaths): GitLogEntry[] {
	let then = rel;
	const named = [...entries].reverse().map((e) => {
		then = nameAt.get(e.hash) ?? then;
		return then === rel ? e : { ...e, path: repo.fromGit(then) };
	});
	return named.reverse();
}

export type GitChangesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	entries?: GitFileChange[];
};

/** What differs from a version NOW, not what it changed: every row then opens a diff with
 *  something in it. Untracked files are absent by design - they postdate every version. */
export async function gitChangesSince(workspaceRoot: string, hash: string): Promise<GitChangesResult> {
	if (!isShowableRef(hash)) return { ok: false, error: 'Invalid revision' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	try {
		const rel = rr.repo.scope;
		// `diff <commit>` is commit -> working tree, so the letters read as "since that version":
		// A is a file that did not exist then, D one that has gone since
		const raw = await git(rr.repo.root).raw(['diff', '--name-status', '-z', hash, ...(rel ? ['--', ...literal([rel])] : [])]);
		// git prints from the REPO root; the renderer deals only in absolute paths inside the folder
		return { ok: true, entries: insideFolder(rr.repo, parseNameStatus(raw)) };
	} catch (e) {
		if (isMissingGit(e)) {
			markGitMissing();
			return { ok: false, reason: 'no-git' };
		}
		return { ok: false, error: errMsg(e) };
	}
}

/** A revision from the window: a commit hash or HEAD, perhaps with a parent step. Anything else is
 *  refused before it reaches git, above all something starting with '-', which `git show` would
 *  take as an option (`--output=<path>` writes a file). Exported for the tests. */
export function isShowableRef(ref: string): boolean {
	return /^(HEAD|[0-9a-f]{4,64})(\^[0-9]?|~[0-9]{1,4})?$/i.test(ref);
}

/** the file at `ref` in the repository; '' where it did not exist then */
async function showFile(repo: RepoPaths, absPath: string, ref: string): Promise<GitShowResult> {
	try {
		const [rel] = repo.toGit([absPath]);
		return { ok: true, hasHead: true, content: await git(repo.root).show([`${ref}:${rel}`, '--']) };
	} catch (e) {
		if (isMissingGit(e)) {
			markGitMissing();
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

/** a file's contents at an arbitrary commit, for diffing a version against the working copy. */
export async function gitShowAt(absPath: string, ref: string): Promise<GitShowResult> {
	if (!absPath) return { ok: false, hasHead: false, error: 'Missing path' };
	if (!isShowableRef(ref)) return { ok: false, hasHead: false, error: 'Invalid revision' };
	const rr = await resolveRepoRoot(folderOnDisk(absPath));
	if (!rr.repo) return { ok: false, hasHead: false, reason: rr.reason };
	return showFile(rr.repo, absPath, ref);
}

/** the repo-relative paths git printed, as absolute paths, keeping only those inside the folder */
function insideFolder(repo: RepoPaths, changes: GitFileChange[]): GitFileChange[] {
	return changes
		.filter((f) => repo.holds(f.path))
		.map((f) => ({ ...f, path: repo.fromGit(f.path), ...(f.from ? { from: repo.fromGit(f.from) } : {}) }));
}

export type GitVersionChangesResult = GitChangesResult & {
	/** what the version is compared with: its first parent, or null for a project's first version */
	parent?: string | null;
};

/**
 * What one version itself changed, against the version before it: the commit view VS Code and
 * GitHub show, next to the "what differs from now" a version opens to in the panel. A merge is
 * read against its first parent, so it lists what the merge brought in.
 */
export async function gitChangesIn(workspaceRoot: string, hash: string): Promise<GitVersionChangesResult> {
	if (!/^[0-9a-f]{4,64}$/i.test(hash)) return { ok: false, error: 'Invalid revision' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	try {
		const g = git(rr.repo.root);
		const rel = rr.repo.scope;
		const scope = rel ? ['--', ...literal([rel])] : [];
		// with -q a missing parent prints nothing and exits 1, which simple-git resolves as ''
		const parent = (await g.raw(['rev-parse', '--verify', '-q', `${hash}^1`])).trim() || null;
		const raw = parent
			? await g.raw(['diff', '--name-status', '-z', '-M', parent, hash, ...scope])
			: await g.raw(['diff-tree', '--root', '-r', '-M', '-z', '--no-commit-id', '--name-status', hash, ...scope]);
		return { ok: true, parent, entries: insideFolder(rr.repo, parseNameStatus(raw)) };
	} catch (e) {
		if (isMissingGit(e)) {
			markGitMissing();
			return { ok: false, reason: 'no-git' };
		}
		return { ok: false, error: errMsg(e) };
	}
}

/** A file as it was at `ref`, found through the project folder rather than the file's own: a file
 *  in a folder deleted since has no directory left to find its repository from. */
export async function gitFileAt(workspaceRoot: string, absPath: string, ref: string): Promise<GitShowResult> {
	if (!absPath) return { ok: false, hasHead: false, error: 'Missing path' };
	if (!isShowableRef(ref)) return { ok: false, hasHead: false, error: 'Invalid revision' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, hasHead: false, reason: rr.reason };
	return showFile(rr.repo, absPath, ref);
}

/** `git commit` with `args`, failing when HEAD did not move. Nothing to commit exits 1 with its
 *  reason on stdout and nothing on stderr, as does a hook that fails without a word, and simple-git
 *  resolves both as though they had worked: the panel said the version was saved. */
export async function commitOrFail(g: SimpleGit, args: string[]): Promise<void> {
	const before = await g.raw(['rev-parse', '--verify', '-q', 'HEAD']);
	const said = await retryLocked(() => g.raw(['commit', ...args]));
	if ((await g.raw(['rev-parse', '--verify', '-q', 'HEAD'])) === before) throw new Error(said.trim() || 'git did not commit');
}

/**
 * What a folder of a larger repository commits: what is staged in the folder and nothing else. A
 * file staged outside it in a terminal is in no row of the panel, and went into the version all the
 * same; `--only` leaves it staged, as it was. Only when there is such a file: `--only` takes each
 * file as it is on disk rather than as staged, and git refuses it part-way through a merge. Null
 * otherwise: the index is committed as it is, as VS Code commits it.
 */
async function onlyInFolder(g: SimpleGit, repo: RepoPaths): Promise<string[] | null> {
	if (!repo.scope) return null;
	// --no-renames: a rename is otherwise listed by its new name only, and the old one stayed staged
	const staged = (await g.raw(['diff', '--cached', '--name-only', '--no-renames', '-z'])).split('\0').filter(Boolean);
	// told apart as the status rows are (gitStatus), so the version holds what the panel listed
	const inside = staged.filter((p) => repo.holds(p));
	if (inside.length === staged.length) return null;
	if (!inside.length) throw new Error('nothing to commit in this folder');
	return literal(inside);
}

/** commit the staged changes. Fails if nothing is staged or no author identity is configured. */
export async function gitCommit(workspaceRoot: string, message: string): Promise<GitOpResult> {
	if (!message || !message.trim()) return { ok: false, error: 'A commit message is required' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	try {
		const g = patientGit(rr.repo.root);
		const only = await onlyInFolder(g, rr.repo);
		if (!only) await commitOrFail(g, ['-m', message]);
		else await runWithPathspecs(only, (pathspecArgs) => commitOrFail(g, ['-m', message, '--only', ...pathspecArgs]));
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
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
export type GitRestoreResult = GitOpResult & {
	/** files no version has now (new ones, or ones .gitignore leaves out) that the restore would
	 *  have replaced with that version's copies: absolute paths. Refused rather than overwritten,
	 *  since git could not give them back */
	untracked?: string[];
	/** 'same': the files already are as that version has them, so there is nothing to restore */
	failure?: 'same';
};

/**
 * Every path that differs between the target and now, so files ADDED since the target are found
 * too; without them the restore would make a version that never existed. Repo-relative and
 * forward-slashed, as in gitLog: a backslashed absolute pathspec matches nothing.
 * --no-renames: a rename is otherwise listed by its new name only, so the restore removed the new
 * file and never brought back the old one. -z: a name with a quote or a backslash in it is
 * otherwise printed quoted, matches nothing, and the restore "succeeds" leaving that file as it is.
 */
async function rewrittenBy(g: SimpleGit, hash: string, where: string[]): Promise<GitFileChange[]> {
	return parseNameStatus(await g.raw(['diff', '--name-status', '--no-renames', '-z', hash, 'HEAD', ...where]));
}

/** Uncommitted work the restore would overwrite, and anything staged in the folder, which its commit
 *  would take along. Work in any other file stays uncommitted: a file unticked to stay on this computer
 *  must not have to be committed for a restore to go ahead (repo-relative) */
async function restoreBlockers(g: SimpleGit, repo: RepoPaths, changed: GitFileChange[]): Promise<string[]> {
	const rewritten = new Set(changed.map((c) => c.path));
	const status = (await statusOf(g, ['--untracked-files=no'])).files;
	return status.filter((f) => rewritten.has(f.path) || (f.index !== ' ' && f.index !== '?' && repo.holds(f.path))).map((f) => f.path);
}

/** what the window has to save as a version before a restore to `hash` can go ahead (absolute) */
export async function gitRestoreInTheWay(workspaceRoot: string, hash: string): Promise<GitOpResult & { files?: string[] }> {
	if (!isShowableRef(hash)) return { ok: false, error: 'Invalid revision' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const repo = rr.repo;
	try {
		const g = git(repo.root);
		const where = repo.scope ? ['--', ...literal([repo.scope])] : [];
		const blocked = await restoreBlockers(g, repo, await rewrittenBy(g, hash, where));
		return { ok: true, files: blocked.map((rel) => repo.fromGit(rel)) };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

export async function gitRestore(workspaceRoot: string, hash: string, message: string): Promise<GitRestoreResult> {
	if (!isShowableRef(hash)) return { ok: false, error: 'Invalid revision' };
	if (!message || !message.trim()) return { ok: false, error: 'A message is required' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const repo = rr.repo;
	try {
		const g = patientGit(repo.root);
		const where = repo.scope ? ['--', ...literal([repo.scope])] : [];
		const changed = await rewrittenBy(g, hash, where);
		if (!changed.length) return { ok: false, failure: 'same', error: 'That version matches the current one.' };
		const blocked = await restoreBlockers(g, repo, changed);
		if (blocked.length) return { ok: false, error: 'Save a version first: there are unsaved changes.' };

		// a file git does not track now, at a name that version has: checkout would replace it without
		// a word. The dirty check above leaves new files out on purpose; ignored ones are the author's
		// too (notes.txt, once in a version and now in .gitignore), and git lists them apart.
		const listed = await Promise.all(
			[[], ['--ignored']].map((opt) => g.raw(['ls-files', '--others', ...opt, '--exclude-standard', '-z', ...where]))
		);
		const untracked = new Set(listed.join('').split('\0'));
		const inTheWay = changed.map((c) => c.path).filter((rel) => untracked.has(rel));
		if (inTheWay.length) {
			return {
				ok: false,
				untracked: inTheWay.map((rel) => repo.fromGit(rel)),
				error: `Restoring would replace new files that are in no version: ${inTheWay.join(', ')}`
			};
		}

		const done: GitFileChange[] = [];
		try {
			for (const c of changed) {
				done.push(c);
				// A (diffed from the target to now): added since, so restoring means removing it. Read from
				// the two versions, never from why a checkout failed: a filter that could not run (a Git LFS
				// download) or a name too long for Windows was taken for "not in that version", and the
				// file was deleted and the deletion saved as the restore.
				const [spec] = literal([c.path]);
				if (c.status === 'A') await retryLocked(() => g.raw(['rm', '-q', '-f', '--ignore-unmatch', '--', spec]));
				else await retryLocked(() => g.raw(['checkout', hash, '--', spec]));
			}
		} catch (e) {
			await undoRestore(g, done);
			throw e;
		}
		// as Save version: what is staged outside the folder stays staged, out of this version
		const only = await onlyInFolder(g, repo);
		if (!only) await commitOrFail(g, ['-m', message]);
		else await runWithPathspecs(only, (pathspecArgs) => commitOrFail(g, ['-m', message, '--only', ...pathspecArgs]));
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/** A restore that failed part-way, put back as the last version has it: half of one version and
 *  half of another is a version that never existed. As far as git can; what it cannot is left for
 *  the panel to show as changes. */
async function undoRestore(g: SimpleGit, done: GitFileChange[]): Promise<void> {
	// one at a time: a checkout stops at the first file it cannot write, and would leave the rest
	for (const c of done) {
		const [spec] = literal([c.path]);
		// D: in the target and not now, so it was brought in, where nothing was before (see inTheWay)
		const undo = c.status === 'D' ? ['rm', '-q', '-f', '--ignore-unmatch', '--', spec] : ['checkout', 'HEAD', '--', spec];
		await g.raw(undo).catch(() => undefined);
	}
}
