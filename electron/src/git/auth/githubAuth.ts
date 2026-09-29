// Signing in to GitHub in the browser, as VS Code's github-authentication extension does it when
// it has no client secret to hand: the device flow. Texpile asks GitHub for a one-time code, the
// author types it at github.com/login/device, and Texpile polls until GitHub hands over a token.
// The token then answers git's github.com questions (gitAskpass.ts), as VS Code's GitHub
// credential provider answers its git extension's: Sync and Publish both sign in with it.
//
// Same scopes as VS Code asks for git: repo, workflow, user:email, read:user. The token is kept
// sealed by the system keychain (Electron's safeStorage) and never reaches the window; without a
// keychain it lasts until Texpile quits. No Electron in the flow itself, so the tests can hand it
// a fetch of their own.
import { GITHUB_CLIENT_ID } from './githubAuthConfig';

export const GITHUB_SCOPES = ['repo', 'workflow', 'user:email', 'read:user'];

export type GithubSession = {
	token: string;
	login: string;
	id: number;
	scopes: string[];
	/** when the token stops working, ms since the epoch; absent for one that does not expire */
	expiresAt?: number;
};

export type DeviceCode = {
	deviceCode: string;
	/** what the author types at `verificationUri`, 'ABCD-1234' */
	userCode: string;
	verificationUri: string;
	/** seconds between polls, as GitHub asks */
	interval: number;
	/** when the code stops working, ms since the epoch */
	expiresAt: number;
};

export type SignInResult =
	| { ok: true; login: string }
	| { ok: false; failure: 'cancelled' | 'expired' | 'denied' | 'unavailable' | 'network' | 'other'; error?: string };

type FetchLike = (
	url: string,
	init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export function githubSignInAvailable(clientId = GITHUB_CLIENT_ID): boolean {
	return /^[A-Za-z0-9._-]{8,64}$/.test(clientId);
}

const FORM = { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' };

/** Step one: a code for the author to type at github.com/login/device */
export async function requestDeviceCode(fetchImpl: FetchLike, clientId = GITHUB_CLIENT_ID, now = Date.now()): Promise<DeviceCode> {
	const res = await fetchImpl('https://github.com/login/device/code', {
		method: 'POST',
		headers: FORM,
		body: new URLSearchParams({ client_id: clientId, scope: GITHUB_SCOPES.join(' ') }).toString()
	});
	if (!res.ok) throw new Error(`Failed to get one-time code: ${await res.text()}`);
	const json = (await res.json()) as {
		device_code?: string;
		user_code?: string;
		verification_uri?: string;
		interval?: number;
		expires_in?: number;
		error_description?: string;
	};
	if (!json.device_code || !json.user_code || !json.verification_uri)
		throw new Error(json.error_description ?? 'Failed to get one-time code');
	// only GitHub's own page: the address is opened in the author's browser
	if (!/^https:\/\/github\.com\//.test(json.verification_uri)) throw new Error('Unexpected verification address');
	return {
		deviceCode: json.device_code,
		userCode: json.user_code,
		verificationUri: json.verification_uri,
		interval: Math.max(1, json.interval ?? 5),
		expiresAt: now + Math.max(60, json.expires_in ?? 900) * 1000
	};
}

/**
 * Step two: ask GitHub for the token every `interval` seconds until the author has typed the code,
 * the code expires, or `signal` says stop. GitHub's slow_down adds five seconds to the interval,
 * as its documentation asks (VS Code's own loop ignores it and retries).
 */
export async function pollForToken(
	fetchImpl: FetchLike,
	code: DeviceCode,
	signal: AbortSignal,
	clientId = GITHUB_CLIENT_ID,
	sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): Promise<{ token: string; expiresIn?: number } | { failure: 'cancelled' | 'expired' | 'denied' | 'other'; error?: string }> {
	let interval = code.interval;
	while (Date.now() < code.expiresAt) {
		await sleep(interval * 1000);
		if (signal.aborted) return { failure: 'cancelled' };
		let json: { access_token?: string; expires_in?: number; error?: string; error_description?: string; interval?: number };
		try {
			const res = await fetchImpl('https://github.com/login/oauth/access_token', {
				method: 'POST',
				headers: FORM,
				body: new URLSearchParams({
					client_id: clientId,
					device_code: code.deviceCode,
					grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
				}).toString()
			});
			if (!res.ok) continue;
			json = (await res.json()) as typeof json;
		} catch {
			continue; // a dropped connection is a reason to ask again, not to give up
		}
		// an app set to expire its tokens says when; without its client secret the token cannot be
		// renewed, so an expired one simply means signing in again
		// cancelled while that request was out: a token that arrives after Cancel is not a sign-in
		if (signal.aborted) return { failure: 'cancelled' };
		if (json.access_token) return { token: json.access_token, ...(json.expires_in ? { expiresIn: json.expires_in } : {}) };
		if (json.error === 'authorization_pending') continue;
		if (json.error === 'slow_down') {
			interval = json.interval ?? interval + 5;
			continue;
		}
		if (json.error === 'expired_token') return { failure: 'expired' };
		if (json.error === 'access_denied') return { failure: 'denied' };
		return { failure: 'other', error: json.error_description ?? json.error };
	}
	return { failure: 'expired' };
}

/** who the token belongs to, for the username git is given and the account the window names */
export async function accountOf(fetchImpl: FetchLike, token: string): Promise<{ login: string; id: number } | null> {
	const res = await fetchImpl('https://api.github.com/user', {
		method: 'GET',
		headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' }
	});
	if (!res.ok) return null;
	const user = (await res.json()) as { login?: unknown; id?: unknown };
	return typeof user.login === 'string' && typeof user.id === 'number' ? { login: user.login, id: user.id } : null;
}

/** a token past its expiry (a minute early, so it does not run out mid-upload) is no sign-in at all */
export function sessionExpired(session: GithubSession, now = Date.now()): boolean {
	return session.expiresAt !== undefined && now >= session.expiresAt - 60_000;
}
