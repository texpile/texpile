// Runs in the helper process (helper/helperWorker.ts): chokidar opens a native watcher per entry,
// synchronously, and that must not hold the main process. workspaceWatch.ts is the main-side end.
//
// Watches a claimed workspace root so the renderer hears about external writes NOW, not on the
// next window focus. Before this, an agent or another editor writing a file went unnoticed until
// the user alt-tabbed back - and the renderer's conflict machinery (externalChange.svelte.ts),
// which is correct and battle-tested, simply never ran in time. This module's entire job is to
// trigger that existing machinery earlier; it decides nothing itself.
//
// chokidar rather than fs.watch: it normalizes the atomic-rename writes editors and agents
// actually do (write temp, rename over target), waits out half-written files (awaitWriteFinish),
// and papers over the per-platform quirks (Windows duplicate events, Linux per-dir inotify).
// Pure JS, so it bundles into main.js with no node-pty-style packaging cost.
//
// chokidar is ESM-only from 4 onwards, which briefly broke dev launch with ERR_REQUIRE_ESM: dev used
// to build with plain `tsc -p electron`, emitting per-file CJS that left the dependency as a runtime
// require(). Both build paths now go through scripts/build-electron.mjs, so the dependency is bundled
// either way and its module format is no longer this file's problem.
import { watch, type FSWatcher } from 'chokidar';
import * as path from 'node:path';
import { resolveRepoRoot, gitDirsOf } from '../git/gitService';

/**
 * Dirs whose contents never matter to the renderer's view of the workspace. Matches the tree
 * scan's TREE_IGNORE_DIRS + dot-dirs (fsService.ts): what the tree does not show cannot need a
 * refresh. Deliberately NOT the wider SCAN_IGNORE_DIRS - the tree does show build/out/output, and
 * a compile dropping a fresh PDF there is exactly the kind of change the tree should pick up.
 * _draft matters most: the draft daemon writes there continuously while the user types.
 */
const IGNORED_DIRS = new Set(['node_modules', '_draft']);

/**
 * The one dot-dir that IS watched.
 *
 * The blanket dot rule is right for `.git`, `.venv`, `.svelte-kit` and friends - churn the user
 * never sees. But `.texpile/` holds the project's own state: the comment log and the compile
 * config, both committed, both rewritten wholesale by a `git pull`. Ignoring it meant a pulled
 * config or a colleague's comments sat unread until the folder was reopened.
 */
const WATCHED_DOT_DIRS = new Set(['.texpile']);

/** trailing debounce: an agent touching five files, or one compile writing aux+log+pdf, should
 * come through as one refresh, not five */
const QUIET_MS = 200;

type Entry = { watcher: FSWatcher; git: FSWatcher | null; timer: NodeJS.Timeout | null };
const watchers = new Map<string, Entry>();

/**
 * git's own bookkeeping, which the dot-dir rule hides: what a commit, checkout, fetch, merge or
 * reset writes. Without these, a `git commit` in the built-in terminal - where the docs send
 * people for everything the panel does not do - left the change list, the branch, the counts and
 * History stale until something else happened to refresh them.
 *
 * Status itself runs with GIT_OPTIONAL_LOCKS=0 (gitProcessEnv.ts), so the refresh this triggers
 * does not rewrite the index and trigger itself again.
 */
function gitStatePaths(gitDir: string, commonDir: string): string[] {
	return [
		...['HEAD', 'index', 'MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply'].map((f) => path.join(gitDir, f)),
		path.join(commonDir, 'refs'),
		path.join(commonDir, 'packed-refs')
	];
}

function ignored(root: string, p: string): boolean {
	const rel = path.relative(root, p);
	if (!rel || rel.startsWith('..')) return false; // the root itself, or outside (symlink): let chokidar handle
	return rel.split(path.sep).some((seg) => (seg.startsWith('.') && !WATCHED_DOT_DIRS.has(seg)) || IGNORED_DIRS.has(seg));
}

/**
 * Watch `root`, calling `onChange` (debounced) on any relevant add/change/unlink. Replaces any
 * existing watcher for the same key. Never throws: a workspace on a filesystem that cannot be
 * watched (some network drives) degrades to today's focus-driven behavior rather than failing
 * the claim that triggered it.
 */
export function startWorkspaceWatch(key: string, root: string, onChange: () => void): void {
	stopWorkspaceWatch(key);
	try {
		const watcher = watch(root, {
			ignoreInitial: true, // the initial scan is not a change
			ignored: (p: string) => ignored(root, p),
			// a large file mid-write fires 'change' before the writer finishes; reading then would
			// briefly show a truncated document. Wait until the size has been stable for a beat.
			awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 }
		});
		const entry: Entry = { watcher, git: null, timer: null };
		function changed() {
			if (entry.timer) clearTimeout(entry.timer);
			entry.timer = setTimeout(() => {
				entry.timer = null;
				onChange();
			}, QUIET_MS);
		}
		watcher.on('all', changed);
		void watchGitState(key, entry, root, changed);
		// EPERM/ENOENT churn (a dir deleted mid-scan, a locked file on Windows) is routine; the
		// watcher keeps running for everything else
		watcher.on('error', (e) => console.warn('fsWatch:', root, e instanceof Error ? e.message : e));
		watchers.set(key, entry);
	} catch (e) {
		console.error('fsWatch: could not watch', root, e);
	}
}

/** Follow the repository the folder is in, if it is in one. A folder that becomes a repository
 *  later (Initialize, or `git init` in the terminal) is picked up the next time it is watched. */
async function watchGitState(key: string, entry: Entry, root: string, changed: () => void): Promise<void> {
	try {
		const rr = await resolveRepoRoot(root);
		if (!rr.repo) return;
		const { gitDir, commonDir } = await gitDirsOf(rr.repo.root);
		const current = watchers.get(key);
		if (current !== entry) return; // stopped or replaced while git answered
		const gitWatcher = watch(gitStatePaths(gitDir, commonDir), {
			ignoreInitial: true,
			// every write to these goes through a .lock file first; the rename that follows is the event
			ignored: (p: string) => p.endsWith('.lock')
		});
		gitWatcher.on('all', changed);
		gitWatcher.on('error', (e) => console.warn('fsWatch (git):', gitDir, e instanceof Error ? e.message : e));
		current.git = gitWatcher;
	} catch (e) {
		console.warn('fsWatch: could not follow git state for', root, e instanceof Error ? e.message : e);
	}
}

export function stopWorkspaceWatch(key: string): void {
	const entry = watchers.get(key);
	if (!entry) return;
	watchers.delete(key);
	if (entry.timer) clearTimeout(entry.timer);
	void entry.watcher.close();
	void entry.git?.close();
}
