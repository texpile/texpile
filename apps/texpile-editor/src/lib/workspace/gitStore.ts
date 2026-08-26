// reactive git state for the open folder. refreshed from WorkspaceView's refreshTree()
// (every tree-refresh trigger updates it for free) and after each Source Control write.
import { box } from '$lib/runes/box.svelte';
import { gitStatus as fetchGitStatus, gitLog as fetchGitLog, type GitBadge, type GitStatusEntry, type GitLogEntry } from './git';

export const isGitRepo = box<boolean>(false);

export const gitBranch = box<string | null>(null);

/** the upstream this branch tracks, or null. Null is what hides the upload button: a branch with
 *  nowhere to send versions has not failed to send them. */
export const gitTracking = box<string | null>(null);

/** versions saved here that the upstream does not have. Counted from local refs, so it is exact
 *  without a fetch, and it is the only remote number shown: `behind` is only as fresh as a fetch
 *  nothing here runs, so showing it would be claiming to know something we do not. */
export const gitAhead = box<number>(0);

/** single-letter badges keyed by gitKey(absolutePath); drives the file tree. */
export const gitStatusMap = box<Record<string, GitBadge>>({});

/** raw staged/unstaged porcelain codes; drives the Source Control panel. */
export const gitChanges = box<GitStatusEntry[]>([]);

/** commits touching the workspace, newest first; drives the history timeline. */
export const gitHistory = box<GitLogEntry[]>([]);

/** why the timeline is empty, when it is empty because the log could not be read at all. Without
 *  this a broken `git log` is indistinguishable from a project nobody has saved a version of. */
export const gitHistoryError = box<string | null>(null);

/** the history runs past what was fetched, so the oldest row shown is not the project's first
 *  version - which is exactly what it would otherwise look like. */
export const gitHistoryHasMore = box<boolean>(false);

/** how many versions the timeline currently asks for; grows on demand rather than fetching a long
 *  history nobody scrolled to. Reset when the folder changes: it is a property of one project's
 *  panel, not of the app. */
const HISTORY_PAGE = 100;
let historyLimit = HISTORY_PAGE;

/** canonical key matching tree paths to badges; guards against separator/casing drift. */
export function gitKey(path: string): string {
	return path.replace(/\\/g, '/').toLowerCase();
}

/** collapses git's two-character XY porcelain code to one badge. x=index (staged), y=working dir. */
export function badgeOf(x: string, y: string): GitBadge {
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

function clearGitState(): void {
	isGitRepo.current = false;
	gitBranch.current = null;
	gitTracking.current = null;
	gitAhead.current = 0;
	gitStatusMap.current = {};
	gitChanges.current = [];
	gitHistory.current = [];
	gitHistoryError.current = null;
}

/** refreshes git state for the open folder; never throws. missingGit lets the caller show the install hint. */
export async function refreshGitStatus(root: string | null): Promise<{ missingGit: boolean }> {
	if (!root) {
		clearGitState();
		return { missingGit: false };
	}
	const res = await fetchGitStatus(root);
	if (!res.ok) {
		clearGitState();
		return { missingGit: res.reason === 'no-git' };
	}
	isGitRepo.current = true;
	gitBranch.current = res.branch ?? null;
	gitTracking.current = res.tracking ?? null;
	gitAhead.current = res.ahead ?? 0;
	const list = res.entries ?? [];
	gitChanges.current = list;
	const map: Record<string, GitBadge> = {};
	for (const e of list) map[gitKey(e.path)] = badgeOf(e.x, e.y);
	gitStatusMap.current = map;
	return { missingGit: false };
}

/** reloads the timeline. Separate from status: status runs on every tree refresh, and the log is
 *  a heavier call that only changes when a commit does. */
export async function refreshGitHistory(root: string | null): Promise<void> {
	if (!root) {
		gitHistory.current = [];
		gitHistoryError.current = null;
		gitHistoryHasMore.current = false;
		historyLimit = HISTORY_PAGE;
		return;
	}
	const res = await fetchGitLog(root, historyLimit);
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
