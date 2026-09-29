// Checking for co-authors' new versions on its own: VS Code's git.autofetch. Its loop, copied: wait
// until git is idle and the window is in front, fetch without a sound, wait three minutes (its
// git.autofetchPeriod), again. On by default here, where VS Code asks first: a writer's conflicts
// come from starting to edit before someone else's work was taken in, and a Sync button that
// already says "1 new version" is what heads that off. Nothing is taken in until the author Syncs.
//
// A check never asks for a sign-in (the quiet fetch in electron/src/git/auth/gitAskpass.ts). One that would
// have needed to stops the checking, as VS Code's does on an authentication failure, until a Sync
// or Check for new versions of the author's own works again.
import { workspaceRoot } from '../../workspaceStore';
import { refreshGitStatus, gitRunning, gitTracking, gitOperation, isGitRepo } from '../gitStore';
import { nativeBridge } from '../../fileSystem';
import { errMsg, NO_BRIDGE } from '../git';
import type { GitFetchResult } from '../remote/scmFetch.svelte';
import { settings } from '$lib/settings';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export type GitAutoCheckBridge = {
	gitFetchQuiet?: (root: string) => Promise<GitFetchResult>;
};

/** VS Code's git.autofetchPeriod default */
export const AUTO_CHECK_PERIOD_MS = 180_000;
/** how soon after the project opens the first check goes, and how often a busy moment is retried */
const SOON_MS = 5_000;

let running: Promise<void> | null = null;
/** the folder whose check stopped at a sign-in. Only that one: another folder has its own remote,
 *  and one refused sign-in stopped the checking in every folder opened after it. */
let paused: string | null = null;

/** resolves once a check under way is over: a Sync or a check of the author's waits for it rather
 *  than fetch alongside it */
export function autoCheckDone(): Promise<void> {
	return running ?? Promise.resolve();
}

/** a Sync or check of the author's own worked: sign-in is fine again, so checking resumes */
export function resumeAutoCheck(): void {
	paused = null;
}

async function fetchQuiet(root: string): Promise<GitFetchResult> {
	const n = nativeBridge();
	if (!n?.gitFetchQuiet) return { ok: false, error: NO_BRIDGE };
	try {
		return await n.gitFetchQuiet(root);
	} catch (e) {
		return { ok: false, error: errMsg(e) };
	}
}

export class AutoCheck {
	#timer: ReturnType<typeof setTimeout> | undefined;
	#last = 0;
	#reported = 0;
	#on = false;

	constructor(private deps: { isBusy(): boolean; sync(): void }) {}

	start = (): void => {
		this.#on = true;
		this.#last = 0;
		this.#reported = 0;
		window.addEventListener('focus', this.#onFocus);
		this.#schedule(SOON_MS);
	};

	stop = (): void => {
		this.#on = false;
		clearTimeout(this.#timer);
		window.removeEventListener('focus', this.#onFocus);
	};

	// back in front after a check came due while away: now, as VS Code's waits for focus
	#onFocus = (): void => {
		if (this.#on && Date.now() - this.#last >= AUTO_CHECK_PERIOD_MS) this.#schedule(0);
	};

	#schedule(ms: number): void {
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => void this.#tick(), ms);
	}

	/** whether a check may go now; null when it is not wanted at all until something changes */
	#ready(): 'now' | 'later' | null {
		const root = workspaceRoot.current;
		if (settings.current.checkForNewVersions === false || !root || root === paused) return null;
		if (!isGitRepo.current || !gitTracking.current || gitOperation.current) return null;
		if (this.deps.isBusy() || gitRunning.current !== null || running) return 'later';
		return document.hasFocus() ? 'now' : null;
	}

	async #tick(): Promise<void> {
		if (!this.#on) return;
		const ready = this.#ready();
		if (ready !== 'now') {
			// busy: soon; away, off or nothing to check: at the next period, or on focus
			this.#schedule(ready === 'later' ? SOON_MS : AUTO_CHECK_PERIOD_MS);
			return;
		}
		const root = workspaceRoot.current!;
		this.#last = Date.now();
		const check = this.#check(root);
		running = check;
		try {
			await check;
		} finally {
			running = null;
		}
		// another folder opened while this one was checked: that one's first check is soon, not a period on
		if (this.#on) this.#schedule(workspaceRoot.current === root ? AUTO_CHECK_PERIOD_MS : SOON_MS);
	}

	async #check(root: string): Promise<void> {
		const res = await fetchQuiet(root);
		if (!res.ok) {
			// it would have had to ask for a sign-in, or the one it had was refused
			if (res.failure === 'cancelled' || res.failure === 'auth') paused = root;
			return;
		}
		if (workspaceRoot.current !== root) return;
		await refreshGitStatus(root);
		const behind = res.behind ?? 0;
		// said once per new arrival, not on every check while the author has not synced yet
		if (behind > this.#reported) {
			const remote = res.remote ?? '';
			toaster.info({
				title: behind === 1 ? m.vcs_fetch_new_one({ remote }) : m.vcs_fetch_new_count({ remote, count: behind }),
				description: m.vcs_auto_new_detail(),
				action: { label: m.vcs_action_sync(), onClick: () => this.deps.sync() }
			});
		}
		this.#reported = behind;
	}
}
