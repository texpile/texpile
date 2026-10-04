// reactive git state for the open folder. refreshed from WorkspaceView's refreshTree()
// (every tree-refresh trigger updates it for free) and after each Source Control write.
import { parentRepoToConfirm, useParentRepo } from '../parentRepo.svelte';
import { workspaceRoot } from '../workspaceStore';
import { pathKey, samePath } from '../fileSystem';
import { box } from '$lib/runes/box.svelte';
import {
	gitStatus as fetchGitStatus,
	gitLog as fetchGitLog,
	type GitBadge,
	type GitStatusEntry,
	type GitLogEntry,
	type GitOperation
} from './git';

export const isGitRepo = box<boolean>(false);

export const gitBranch = box<string | null>(null);

/** the upstream this branch tracks, or null. Null is what hides the upload button: a branch with
 *  nowhere to send versions has not failed to send them. */
export const gitTracking = box<string | null>(null);

/** versions saved here that the upstream does not have. Counted from local refs, so it is exact
 *  without a fetch. */
export const gitAhead = box<number>(0);

/** versions the upstream has that this branch does not, as of the last fetch - which Sync runs, so
 *  the number is fresh right after one and otherwise only as fresh as whoever fetched last. The
 *  panel says so rather than presenting it as live. */
export const gitBehind = box<number>(0);

/** there is at least one version: before the first, a branch has nothing to publish */
export const gitHasCommits = box<boolean>(false);
/** a repository above the open folder, not used until the author agrees (parentRepo.svelte.ts) */
export const gitHeldBack = box<boolean>(false);

/** HEAD is a commit rather than a branch, so there is no branch to publish or sync */
export const gitDetached = box<boolean>(false);

/** a merge, rebase, cherry-pick or revert that is waiting to be finished or cancelled - started by
 *  Sync, or in the terminal. While it lasts, Save version would record it half-done. */
export const gitOperation = box<GitOperation | null>(null);

/** git itself is not installed, as against the folder not being a repository: the panel says
 *  which, since the one thing it can offer for "not a repository" fails without git */
export const gitMissing = box<boolean>(false);
/** the repository git will not work in because another account owns its folder, as git names it */
export const gitUnsafe = box<string | null>(null);
/** where the repository starts, which is above the open folder when it sits inside a larger one */
export const gitRepoRoot = box<string | null>(null);
/** the commit HEAD points at; it moves when a version is saved, synced in, or a branch switched */
export const gitHead = box<string | null>(null);

/** single-letter badges keyed by gitKey(absolutePath); drives the file tree. */
export const gitStatusMap = box<Record<string, GitBadge>>({});
/** every folder with a change somewhere inside it, by gitKey: 'C' if a file in it is still being
 *  combined, 'M' if anything was changed or removed, 'A' if it only gained files */
export const gitFolderStatus = box<Record<string, GitBadge>>({});

/** raw staged/unstaged porcelain codes; drives the Source Control panel. */
export const gitChanges = box<GitStatusEntry[]>([]);
/** what Source Control is doing right now, for the button that started it to say so */
export const gitRunning = box<'save' | 'sync' | 'publish' | 'fetch' | null>(null);
/** gitChanges was cut short: how many changes there were; 0 when it is whole */
export const gitTruncated = box<number>(0);

/** commits touching the workspace, newest first; drives the history timeline. */
export const gitHistory = box<GitLogEntry[]>([]);

/** why the timeline is empty, when it is empty because the log could not be read at all. Without
 *  this a broken `git log` is indistinguishable from a project nobody has saved a version of. */
export const gitHistoryError = box<string | null>(null);

/** the history runs past what was fetched, so the oldest row shown is not the project's first
 *  version - which is exactly what it would otherwise look like. */
export const gitHistoryHasMore = box<boolean>(false);
/** History has been read for the folder open now: until it has, an empty list is not "no versions"
 *  but "not read yet", and the panel says loading instead */
export const gitHistoryLoaded = box<boolean>(false);
let historyRoot: string | null = null;

/** how many versions the timeline currently asks for; grows on demand rather than fetching a long
 *  history nobody scrolled to. Reset when the folder changes: it is a property of one project's
 *  panel, not of the app. */
const HISTORY_PAGE = 100;
let historyLimit = HISTORY_PAGE;

/** canonical key matching tree paths to badges; guards against separator/casing drift. */
export function gitKey(path: string): string {
	return pathKey(path);
}

/** a file with no copy in the last version: untracked, or staged as added. Discarding it deletes it. */
export function isNewFile(c: { x: string }): boolean {
	return c.x === '?' || c.x === 'A';
}

/** git's unmerged codes (UU, AA, DD, AU, UA, DU, UD): both sides changed the file and git could not
 *  combine them. Folded into 'M' they read as an ordinary edit, ticked for the next version with
 *  the conflict markers still in them. */
export function isConflicted(x: string, y: string): boolean {
	return x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
}

/** collapses git's two-character XY porcelain code to one badge. x=index (staged), y=working dir. */
const FOLDER_RANK: Record<GitBadge, number> = { C: 3, M: 2, D: 2, R: 2, A: 1, U: 1 };

/** exported for the tests: each changed file's folders up to the project root, marked with the
 *  weightiest change below them. Computed once per status read, not per row as the tree draws. */
export function foldersOf(files: Record<string, GitBadge>, root: string): Record<string, GitBadge> {
	const top = gitKey(root).replace(/\/+$/, '');
	const out: Record<string, GitBadge> = {};
	for (const [key, badge] of Object.entries(files)) {
		const mark: GitBadge = badge === 'C' ? 'C' : FOLDER_RANK[badge] === 2 ? 'M' : 'A';
		for (
			let dir = key.slice(0, key.lastIndexOf('/'));
			dir.length > top.length && dir.startsWith(top);
			dir = dir.slice(0, dir.lastIndexOf('/'))
		) {
			if (out[dir] && FOLDER_RANK[out[dir]] >= FOLDER_RANK[mark]) break; // everything above is marked at least this high
			out[dir] = mark;
		}
	}
	return out;
}

export function badgeOf(x: string, y: string): GitBadge {
	if (isConflicted(x, y)) return 'C'; // both changed
	if (x === '?' || y === '?') return 'U'; // untracked
	if (x === 'D' || y === 'D') return 'D'; // deleted
	if (x === 'R') return 'R'; // renamed
	if (x === 'A') return 'A'; // added
	return 'M'; // modified / everything else with a change
}

// one-shot per renderer session: show the "git not installed" hint once, then stay quiet
let noGitHintShown = false;
export function takeNoGitHint(): boolean {
	if (noGitHintShown) return false;
	noGitHintShown = true;
	return true;
}

// Status waits while Source Control is writing. A refresh from the watcher or a window focus in the
// middle of a Save version or Sync used to race it for .git/index.lock; it now runs once the write
// is over, for the folder it was asked about.
let writing = false;
/** the same, for the rows whose actions must wait for it: a discard in the middle of a save */
export const gitWriting = box<boolean>(false);
let waitingRoot: string | null | undefined;

/** ScmActions says when it starts and stops writing to the repository */
export function setGitWriting(on: boolean): void {
	writing = on;
	gitWriting.current = on;
	if (on || waitingRoot === undefined) return;
	// the folder open now: another may have been opened while a Sync waited on the network, and the
	// refresh that Sync queued for its own folder would put that folder's state on this one's panel
	const root = workspaceRoot.current ?? waitingRoot;
	waitingRoot = undefined;
	void refreshGitStatus(root);
}

/** a read that finished after another folder was opened describes the wrong folder, and is dropped.
 *  With no folder open there is nothing to compare with. */
function stillOpen(root: string): boolean {
	const open = workspaceRoot.current;
	return !open || samePath(open, root);
}

// the commit HEAD was at last time; when it moves (a version saved here or in a terminal, a sync, a
// checkout), History is out of date
let lastHead: string | undefined;

function clearGitState(): void {
	lastHead = undefined;
	gitOperation.current = null;
	gitRepoRoot.current = null;
	gitHead.current = null;
	isGitRepo.current = false;
	gitHeldBack.current = false;
	gitBranch.current = null;
	gitTracking.current = null;
	gitAhead.current = 0;
	gitBehind.current = 0;
	gitHasCommits.current = false;
	gitDetached.current = false;
	gitStatusMap.current = {};
	gitFolderStatus.current = {};
	gitChanges.current = [];
	gitTruncated.current = 0;
	gitHistory.current = [];
	gitHistoryError.current = null;
	gitHistoryLoaded.current = false;
	historyRoot = null;
}

/** refreshes git state for the open folder; never throws. missingGit lets the caller show the install hint.
 *  `own`: Source Control reading between two of its own writes, which has nothing to wait for. Letting
 *  go of busy to read instead re-enabled Commit for that moment, and a second Ctrl+Enter got in. */
export async function refreshGitStatus(root: string | null, own = false): Promise<{ missingGit: boolean }> {
	if (!root) {
		clearGitState();
		gitMissing.current = false;
		gitUnsafe.current = null;
		return { missingGit: false };
	}
	if (writing && !own) {
		waitingRoot = root;
		return { missingGit: false };
	}
	const res = await fetchGitStatus(root);
	if (!stillOpen(root)) return { missingGit: false };
	gitMissing.current = !res.ok && res.reason === 'no-git';
	gitUnsafe.current = !res.ok && res.reason === 'unsafe' ? (res.unsafe ?? root) : null;
	if (!res.ok) {
		clearGitState();
		return { missingGit: gitMissing.current };
	}
	isGitRepo.current = true;
	gitRepoRoot.current = res.repoRoot ?? null;
	// A repository above the folder is not used until the author says so, as VS Code opens none
	// (git.openRepositoryInParentFolders): no colours in the tree, no count on the badge, no marks in
	// the margin, no checking for new versions. Source Control shows the question meanwhile.
	gitHeldBack.current = parentRepoToConfirm(root, res.repoRoot ?? null) !== null;
	if (gitHeldBack.current) {
		gitOperation.current = null;
		gitTracking.current = null;
		gitChanges.current = [];
		gitStatusMap.current = {};
		gitFolderStatus.current = {};
		return { missingGit: false };
	}
	gitOperation.current = res.operation ?? null;
	if ((res.head ?? null) !== gitHead.current) gitHead.current = res.head ?? null;
	if (res.head !== undefined && res.head !== lastHead) {
		const moved = lastHead !== undefined;
		lastHead = res.head;
		if (moved) void refreshGitHistory(root);
	}
	gitBranch.current = res.branch ?? null;
	gitTracking.current = res.tracking ?? null;
	gitAhead.current = res.ahead ?? 0;
	gitBehind.current = res.behind ?? 0;
	gitHasCommits.current = res.hasCommits ?? true;
	gitDetached.current = !!res.detached;
	const list = res.entries ?? [];
	gitChanges.current = list;
	gitTruncated.current = res.truncated ?? 0;
	const map: Record<string, GitBadge> = {};
	for (const e of list) map[gitKey(e.path)] = badgeOf(e.x, e.y);
	gitStatusMap.current = map;
	gitFolderStatus.current = foldersOf(map, root);
	return { missingGit: false };
}

/** Source Control's Use this repository: remembered, and taken up at once by the tree, the badge
 *  and the margin, which held back until now */
export async function useParentRepoNow(root: string | null): Promise<void> {
	if (!root || !gitRepoRoot.current) return;
	useParentRepo(root, gitRepoRoot.current);
	await refreshGitStatus(root);
}

/** reloads the timeline. Separate from status: status runs on every tree refresh, and the log is
 *  a heavier call that only changes when a commit does. */
export async function refreshGitHistory(root: string | null): Promise<void> {
	if (!root) {
		gitHistory.current = [];
		gitHistoryError.current = null;
		gitHistoryHasMore.current = false;
		gitHistoryLoaded.current = false;
		historyRoot = null;
		historyLimit = HISTORY_PAGE;
		return;
	}
	if (historyRoot === null || !samePath(historyRoot, root)) gitHistoryLoaded.current = false;
	const res = await fetchGitLog(root, historyLimit);
	if (!stillOpen(root)) return;
	historyRoot = root;
	gitHistoryLoaded.current = true;
	gitHistory.current = res.ok ? (res.entries ?? []) : [];
	gitHistoryHasMore.current = res.ok && !!res.hasMore;
	// 'not-a-repo' is not a failure to report: the panel already says the folder is not tracked
	gitHistoryError.current = res.ok || res.reason === 'not-a-repo' ? null : (res.error ?? res.reason ?? 'unknown');
}

/** show another page of older versions. Reads one more page than last time rather than paging by
 *  offset: `git log` is cheap from the tip, and a second call with a skip could disagree with the
 *  first if a version was saved in between. */
export async function showMoreGitHistory(root: string | null): Promise<void> {
	historyLimit += HISTORY_PAGE;
	await refreshGitHistory(root);
}
