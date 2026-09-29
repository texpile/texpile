// The GitHub sign-in's session (githubAuth.ts): kept sealed in the same keychain-backed store as
// git's typed sign-ins (gitSignIns.ts), so Forget saved Git sign-ins forgets it too, and held in
// memory only where there is no keychain. The window starts and cancels a sign-in and learns the
// account name; the token itself never leaves this process.
import { ipcMain, net, shell } from 'electron';
import {
	accountOf,
	githubSignInAvailable,
	GITHUB_SCOPES,
	pollForToken,
	requestDeviceCode,
	sessionExpired,
	type DeviceCode,
	type GithubSession,
	type SignInResult
} from './githubAuth';
import type { SignIns } from './gitSignIns';

const KEY = 'texpile:github-session';

let store: (() => SignIns) | null = null;
let memory: GithubSession | null = null;
let pending: { code: DeviceCode; abort: AbortController } | null = null;

function fetchImpl(url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Response> {
	return net.fetch(url, init);
}

function stored(): GithubSession | null {
	if (memory) return memory;
	const sealed = store?.().recall(KEY);
	if (!sealed) return null;
	try {
		const parsed = JSON.parse(sealed) as GithubSession;
		return typeof parsed.token === 'string' && typeof parsed.login === 'string' ? parsed : null;
	} catch {
		return null;
	}
}

/** the signed-in account, or null; one whose token has expired is signed out, so git's next
 *  question offers the sign-in again instead of failing with the old token */
export function githubSession(): GithubSession | null {
	const session = stored();
	if (session && sessionExpired(session)) {
		forgetGithubSession();
		return null;
	}
	return session;
}

function save(session: GithubSession): void {
	const s = store?.();
	if (s?.available) s.keep([[KEY, JSON.stringify(session)]]);
	else memory = session;
}

/** signed out: here, and wherever a refused token should not be tried again */
export function forgetGithubSession(): void {
	memory = null;
	store?.().forget([KEY]);
}

async function finish(): Promise<SignInResult> {
	const p = pending;
	if (!p) return { ok: false, failure: 'other' };
	try {
		const got = await pollForToken(fetchImpl, p.code, p.abort.signal);
		if ('failure' in got) return { ok: false, failure: got.failure, error: got.error };
		const account = await accountOf(fetchImpl, got.token);
		if (!account) return { ok: false, failure: 'other', error: 'GitHub did not say whose token this is' };
		save({
			token: got.token,
			login: account.login,
			id: account.id,
			scopes: GITHUB_SCOPES,
			...(got.expiresIn ? { expiresAt: Date.now() + got.expiresIn * 1000 } : {})
		});
		return { ok: true, login: account.login };
	} catch (e) {
		return { ok: false, failure: 'network', error: e instanceof Error ? e.message : String(e) };
	} finally {
		if (pending === p) pending = null;
	}
}

export function registerGithubAuthIpc(signIns: () => SignIns): void {
	store = signIns;
	ipcMain.handle('github:available', () => githubSignInAvailable());
	ipcMain.handle('github:account', () => githubSession()?.login ?? null);
	// step one: the code to show; the device code GitHub polls with stays here
	ipcMain.handle('github:startSignIn', async () => {
		if (!githubSignInAvailable()) return { ok: false, failure: 'unavailable' };
		pending?.abort.abort();
		try {
			const code = await requestDeviceCode(fetchImpl);
			pending = { code, abort: new AbortController() };
			return { ok: true, userCode: code.userCode, verificationUri: code.verificationUri };
		} catch (e) {
			return { ok: false, failure: 'network', error: e instanceof Error ? e.message : String(e) };
		}
	});
	// GitHub's own page, in the browser: the address came from GitHub and was checked in requestDeviceCode
	ipcMain.handle('github:openVerification', () => (pending ? shell.openExternal(pending.code.verificationUri) : undefined));
	ipcMain.handle('github:finishSignIn', () => finish());
	ipcMain.handle('github:cancelSignIn', () => {
		pending?.abort.abort();
		return true;
	});
	ipcMain.handle('github:signOut', () => {
		forgetGithubSession();
		return true;
	});
}
