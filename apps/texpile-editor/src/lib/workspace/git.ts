// client-side git access over Electron IPC. never throws: a non-repo folder, a missing
// git binary, or a missing bridge comes back as { ok: false }
import { nativeBridge } from './fileSystem';

/** single-letter tree badge (VS Code convention). */
export type GitBadge = 'M' | 'A' | 'D' | 'U' | 'R';

export type GitStatusEntry = {
	path: string; // absolute, matching the file-tree's path strings
	x: string; // index (staged) porcelain char, ' ' if none, '?' if untracked
	y: string; // working-dir (unstaged) porcelain char
};

export type GitStatusResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
	branch?: string;
	entries?: GitStatusEntry[];
	/** the upstream this branch tracks ('origin/master'), or null if it tracks nothing */
	tracking?: string | null;
	/** versions here the upstream does not have; read from local refs, so no network and never stale */
	ahead?: number;
	/** only as fresh as the last fetch, which Texpile never runs: do not present it as current */
	behind?: number;
};

export type GitShowResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
	hasHead: boolean;
	content?: string;
};

export type GitOpResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
	error?: string;
};

const NO_BRIDGE = 'Git requires the Texpile desktop app.';

function errMsg(e: unknown) {
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
export type GitFileChange = { path: string; status: GitBadge };

export type GitLogEntry = {
	hash: string;
	short: string;
	subject: string;
	author: string;
	/** author date, ISO 8601 */
	date: string;
	/** versions this one was made from; two or more means it joined two lines of work */
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
	reason?: 'not-a-repo' | 'no-git';
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

/** roll the workspace back to a commit, recorded as a new commit rather than a reset. */
export async function gitRestore(root: string, hash: string, message: string): Promise<GitOpResult> {
	const n = nativeBridge();
	if (!n?.gitRestore) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitRestore(root, hash, message);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** why an upload did not happen; the panel turns each into a different sentence */
export type PushFailure = 'no-upstream' | 'rejected' | 'auth' | 'network' | 'other';

export type GitPushResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git';
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
