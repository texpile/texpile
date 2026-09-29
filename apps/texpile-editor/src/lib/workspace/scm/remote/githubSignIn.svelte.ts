// Signing in to GitHub in the browser, in the window: VS Code's device-code flow as its GitHub
// authentication extension shows it. A dialog with the one-time code and Copy & Continue to GitHub;
// the code on the clipboard and github.com/login/device in the browser; then a notice that waits,
// with Cancel, until the code has been typed there. The token stays in the main process
// (electron/src/git/auth/githubSession.ts); the window only ever learns the account's name.
import { nativeBridge } from '../../fileSystem';
import { promptAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

type Start = { ok: boolean; userCode?: string; verificationUri?: string; failure?: string; error?: string };
type Finish = {
	ok: boolean;
	login?: string;
	failure?: 'cancelled' | 'expired' | 'denied' | 'unavailable' | 'network' | 'other';
	error?: string;
};

/** Optional: an older preload predates it, and GitHub is signed in to the way git always did */
export type GithubAuthBridge = {
	githubSignInAvailable?: () => Promise<boolean>;
	githubAccount?: () => Promise<string | null>;
	githubStartSignIn?: () => Promise<Start>;
	githubOpenVerification?: () => Promise<void>;
	githubFinishSignIn?: () => Promise<Finish>;
	githubCancelSignIn?: () => Promise<boolean>;
	githubSignOut?: () => Promise<boolean>;
	gitAskpassUseGithub?: (id: number) => Promise<boolean>;
};

// whether the browser sign-in is offered and who is signed in, for the palette's account commands
let status = $state<{ available: boolean; login: string | null }>({ available: false, login: null });
export const githubStatus = {
	get current() {
		return status;
	},
	async refresh(): Promise<void> {
		status = { available: await githubSignInAvailable(), login: await githubAccount() };
	}
};

export async function githubSignInAvailable(): Promise<boolean> {
	try {
		return !!(await nativeBridge()?.githubSignInAvailable?.());
	} catch {
		return false;
	}
}

export async function githubAccount(): Promise<string | null> {
	try {
		return (await nativeBridge()?.githubAccount?.()) ?? null;
	} catch {
		return null;
	}
}

function failureText(res: Finish): string {
	if (res.failure === 'expired') return m.github_signin_expired();
	if (res.failure === 'denied') return m.github_signin_denied();
	if (res.failure === 'network') return m.github_signin_network();
	return res.error ?? m.github_signin_failed_generic();
}

/** the whole flow; resolves to the account's login, or null when it did not happen */
export async function signInToGithub(): Promise<string | null> {
	const n = nativeBridge();
	if (!n?.githubStartSignIn || !n.githubFinishSignIn) return null;
	const start = await n
		.githubStartSignIn()
		.catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) }) as Start);
	if (!start.ok || !start.userCode || !start.verificationUri) {
		toaster.error({ title: m.github_signin_failed(), description: start.error ?? m.github_signin_network() });
		return null;
	}
	const code = start.userCode;
	const go = await promptAsk({
		title: m.github_signin_title(),
		message: m.github_your_code({ code }),
		detail: m.github_code_detail(),
		buttons: [
			{ id: 'go', label: m.github_copy_continue(), primary: true },
			{ id: 'cancel', label: m.vcs_cancel() }
		],
		cancelId: 'cancel'
	});
	if (go !== 'go') {
		void n.githubCancelSignIn?.();
		return null;
	}
	await navigator.clipboard.writeText(code).catch(() => {});
	await n.githubOpenVerification?.();
	const waiting = toaster.create({
		type: 'loading',
		title: m.github_waiting_title(),
		description: m.github_waiting({ uri: start.verificationUri.replace(/^https:\/\//, ''), code }),
		duration: Infinity,
		action: { label: m.vcs_cancel(), onClick: () => void n.githubCancelSignIn?.() }
	});
	const res = await n
		.githubFinishSignIn()
		.catch((e: unknown) => ({ ok: false, failure: 'network', error: e instanceof Error ? e.message : String(e) }) as Finish);
	toaster.dismiss(waiting);
	if (!res.ok || !res.login) {
		if (res.failure !== 'cancelled') toaster.error({ title: m.github_signin_failed(), description: failureText(res) });
		return null;
	}
	toaster.success({ title: m.github_signed_in({ login: res.login }) });
	void githubStatus.refresh();
	return res.login;
}

export async function signOutOfGithub(): Promise<void> {
	const login = await githubAccount();
	await nativeBridge()?.githubSignOut?.();
	void githubStatus.refresh();
	if (login) toaster.success({ title: m.github_signed_out({ login }) });
}

/** a git question for github.com, answered by signing in instead of typing a token */
export async function answerWithGithub(questionId: number): Promise<boolean> {
	if (!(await signInToGithub())) return false;
	try {
		return !!(await nativeBridge()?.gitAskpassUseGithub?.(questionId));
	} catch {
		return false;
	}
}
