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

const watchers = new Map<string, { watcher: FSWatcher; timer: NodeJS.Timeout | null }>();

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
		const entry: { watcher: FSWatcher; timer: NodeJS.Timeout | null } = { watcher, timer: null };
		watcher.on('all', () => {
			if (entry.timer) clearTimeout(entry.timer);
			entry.timer = setTimeout(() => {
				entry.timer = null;
				onChange();
			}, QUIET_MS);
		});
		// EPERM/ENOENT churn (a dir deleted mid-scan, a locked file on Windows) is routine; the
		// watcher keeps running for everything else
		watcher.on('error', (e) => console.warn('fsWatch:', root, e instanceof Error ? e.message : e));
		watchers.set(key, entry);
	} catch (e) {
		console.error('fsWatch: could not watch', root, e);
	}
}

export function stopWorkspaceWatch(key: string): void {
	const entry = watchers.get(key);
	if (!entry) return;
	watchers.delete(key);
	if (entry.timer) clearTimeout(entry.timer);
	void entry.watcher.close();
}
