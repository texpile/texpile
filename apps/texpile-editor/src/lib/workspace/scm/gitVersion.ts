// client half of gitChangesIn / gitFileAt (electron/src/git/history/gitHistory.ts): what one version changed,
// and each file on either side of it. Never throws.
import { nativeBridge } from '../fileSystem';
import { NO_BRIDGE, errMsg, type GitFileChange, type GitShowResult, type GitLogResult } from './git';

export type GitVersionChangesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	entries?: GitFileChange[];
	/** the version it is compared with; null for a project's first version */
	parent?: string | null;
};

/** Optional: an older preload predates it, and History offers no per-version view. */
export type GitVersionBridge = {
	gitChangesIn?: (root: string, hash: string) => Promise<GitVersionChangesResult>;
	gitFileAt?: (root: string, path: string, ref: string) => Promise<GitShowResult>;
	gitFileLog?: (root: string, path: string, limit?: number) => Promise<GitLogResult>;
};

export function canShowVersion(): boolean {
	return !!nativeBridge()?.gitChangesIn;
}

export async function gitChangesIn(root: string, hash: string): Promise<GitVersionChangesResult> {
	const n = nativeBridge();
	if (!n?.gitChangesIn) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitChangesIn(root, hash);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** the file's text at `ref`; '' where it did not exist */
export async function gitFileAt(root: string, path: string, ref: string): Promise<GitShowResult> {
	const n = nativeBridge();
	if (!n?.gitFileAt) return { ok: false, hasHead: false, error: NO_BRIDGE };
	try {
		return await n.gitFileAt(root, path, ref);
	} catch (e) {
		return { ok: false, hasHead: false, error: errMsg(e) };
	}
}

/** one file's versions, newest first, across renames: the Timeline's git half */
export async function gitFileLog(root: string, path: string, limit = 50): Promise<GitLogResult> {
	const n = nativeBridge();
	if (!n?.gitFileLog) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitFileLog(root, path, limit);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}
