// client half of electron/src/git/history/gitCombine.ts: combining two lines of work in the app. Never throws.
import { nativeBridge } from '../../fileSystem';
import { NO_BRIDGE, errMsg, type GitOpResult } from '../git';

export type GitCombineResult = GitOpResult & {
	/** 'busy': a merge, rebase or cherry-pick is already under way. 'dirty': work not saved as a
	 *  version is in the way. 'markers': a file still holds a place nobody has chosen for.
	 *  'not-combining': there is no merge to finish. */
	failure?: 'no-upstream' | 'busy' | 'dirty' | 'markers' | 'not-combining';
	/** what this branch is being combined with: 'origin/main' */
	with?: string;
	/** absolute paths of the files left marked; empty when git joined the two on its own */
	conflicts?: string[];
	/** absolute paths behind a 'dirty' or a 'markers' */
	files?: string[];
};

/** Optional: an older preload predates it, and the panel then leaves merges to the terminal. */
export type GitCombineBridge = {
	gitCombine?: (root: string, message?: string) => Promise<GitCombineResult>;
	gitFinishCombine?: (root: string) => Promise<GitCombineResult>;
	gitCancelCombine?: (root: string) => Promise<GitOpResult>;
	gitKeepSide?: (root: string, path: string, side: 'mine' | 'theirs') => Promise<GitOpResult>;
};

async function call<R extends GitOpResult>(fn: ((root: string) => Promise<R>) | undefined, root: string): Promise<R | GitOpResult> {
	if (!fn) return { ok: false, error: NO_BRIDGE };
	try {
		return await fn(root);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

/** merge the upstream the last Sync fetched, leaving conflict markers in the files; `message` is the
 *  merge commit's, git's own without one */
export function gitCombine(root: string, message = ''): Promise<GitCombineResult> {
	const fn = nativeBridge()?.gitCombine;
	return call(fn ? (r) => fn(r, message) : undefined, root);
}

/** save the merge as a version, once no file holds a marked place */
export function gitFinishCombine(root: string): Promise<GitCombineResult> {
	return call(nativeBridge()?.gitFinishCombine, root);
}

/** put everything back as it was before the merge */
export function gitCancelCombine(root: string): Promise<GitOpResult> {
	return call(nativeBridge()?.gitCancelCombine, root);
}

/** the bridge can do this at all: the panel offers Finish and Cancel only where it can */
export function canCombine(): boolean {
	return !!nativeBridge()?.gitFinishCombine;
}

/** one side's whole file, for a file both sides changed: a figure, or one side deleted it */
export function gitKeepSide(root: string, path: string, side: 'mine' | 'theirs'): Promise<GitOpResult> {
	const fn = nativeBridge()?.gitKeepSide;
	return call(fn && ((r: string) => fn(r, path, side)), root);
}
