// Entry of the helper utility process: git and the workspace watcher run here, not in the main
// process. On Windows both do their setup synchronously on the calling thread (a spawn creates
// the child in CreateProcess, chokidar opens one directory handle per watched entry), and the
// main process is also what serves the renderer its code chunks: those holds left the editor
// waiting on a blank pane (startupStats.ts caught it). helperProcess.ts is the other end.
import * as gitService from '../git/gitService';
import * as gitRemote from '../git/remote/gitRemote';
import * as gitHistory from '../git/history/gitHistory';
import * as gitCombine from '../git/history/gitCombine';
import * as gitBranches from '../git/history/gitBranches';
import * as gitTrust from '../git/gitTrust';
import * as gitFetch from '../git/remote/gitFetch';
import { gitClone } from '../git/remote/gitClone';
import type { GitAuthEnv } from '../git/remote/gitRemote';
import { startWorkspaceWatch, stopWorkspaceWatch } from '../fs/fsWatch';
import { pathKey } from '../shell/toolDirs';
import { GIT_PROCESS_ENV } from '../git/gitProcessEnv';

type Call = { id: number; op: string; args: unknown[] };

// Every git here inherits this process's environment: English and no optional locks
// (gitProcessEnv.ts says why each).
Object.assign(process.env, GIT_PROCESS_ENV);

const port = process.parentPort;

/** clones under way, by the key main gave each */
const clones = new Map<string, AbortController>();

function run(op: string, args: unknown[]): unknown {
	if (op === 'watch.start') {
		const [key, root] = args as [string, string];
		startWorkspaceWatch(key, root, () => port.postMessage({ event: 'fs-changed', key }));
		return true;
	}
	if (op === 'watch.stop') {
		stopWorkspaceWatch(args[0] as string);
		return true;
	}
	if (op === 'env.path') {
		process.env[pathKey()] = args[0] as string;
		return true;
	}
	if (op === 'git.gitClone') {
		// the one git call that reports as it goes, and the one that can be stopped: both by the key
		// in its last argument
		const [url, parent, name, auth, key] = args as [string, string, string, GitAuthEnv, string];
		const stop = new AbortController();
		clones.set(key, stop);
		return gitClone(url, parent, name, auth, (data) => port.postMessage({ event: 'git-progress', key, data }), stop.signal).finally(() =>
			clones.delete(key)
		);
	}
	if (op === 'git.cancelClone') {
		clones.get(args[0] as string)?.abort();
		return true;
	}
	if (op.startsWith('git.')) {
		const name = op.slice(4);
		const fn =
			(gitService as Record<string, unknown>)[name] ??
			(gitHistory as Record<string, unknown>)[name] ??
			(gitRemote as Record<string, unknown>)[name] ??
			(gitCombine as Record<string, unknown>)[name] ??
			(gitBranches as Record<string, unknown>)[name] ??
			(gitTrust as Record<string, unknown>)[name] ??
			(gitFetch as Record<string, unknown>)[name];
		if (typeof fn === 'function') return (fn as (...a: unknown[]) => unknown)(...args);
	}
	throw new Error(`unknown helper op ${op}`);
}

port.on('message', (e) => {
	const { id, op, args } = e.data as Call;
	Promise.resolve()
		.then(() => run(op, args))
		.then(
			(value) => port.postMessage({ id, ok: true, value }),
			(err: unknown) => port.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
		);
});
