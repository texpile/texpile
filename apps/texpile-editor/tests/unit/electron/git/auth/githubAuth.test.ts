// GitHub's device flow, as VS Code's github-authentication extension runs it without a client
// secret: a one-time code, then polling until the author has typed it at github.com/login/device.
import { it, expect } from 'vitest';
import {
	requestDeviceCode,
	pollForToken,
	accountOf,
	githubSignInAvailable,
	sessionExpired,
	GITHUB_SCOPES
} from '../../../../../../../electron/src/git/auth/githubAuth';

type Call = { url: string; body?: string };

function scripted(replies: unknown[]) {
	const calls: Call[] = [];
	const fetchImpl = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
		calls.push({ url, body: init.body });
		const reply = replies.shift();
		if (reply instanceof Error) throw reply;
		return { ok: true, status: 200, json: async () => reply, text: async () => JSON.stringify(reply) };
	};
	return { fetchImpl, calls };
}
const noSleep = async () => {};

it('asks for a code with VS Code’s scopes, and only trusts GitHub’s own address', async () => {
	const { fetchImpl, calls } = scripted([
		{ device_code: 'dev', user_code: 'ABCD-1234', verification_uri: 'https://github.com/login/device', interval: 5, expires_in: 900 }
	]);
	const code = await requestDeviceCode(fetchImpl, 'Iv1.texpile0000', 1_000);
	expect(code).toEqual({
		deviceCode: 'dev',
		userCode: 'ABCD-1234',
		verificationUri: 'https://github.com/login/device',
		interval: 5,
		expiresAt: 901_000
	});
	expect(calls[0].url).toBe('https://github.com/login/device/code');
	expect(new URLSearchParams(calls[0].body).get('scope')).toBe(GITHUB_SCOPES.join(' '));

	const evil = scripted([{ device_code: 'd', user_code: 'X', verification_uri: 'https://example.com/phish' }]);
	await expect(requestDeviceCode(evil.fetchImpl, 'Iv1.texpile0000')).rejects.toThrow('Unexpected verification address');
});

it('keeps asking while the code is pending, slows down when told, and returns the token', async () => {
	const { fetchImpl, calls } = scripted([
		{ error: 'authorization_pending' },
		{ error: 'slow_down', interval: 10 },
		new Error('offline'),
		{ access_token: 'gho_token' }
	]);
	const waits: number[] = [];
	const code = {
		deviceCode: 'dev',
		userCode: 'A',
		verificationUri: 'https://github.com/login/device',
		interval: 5,
		expiresAt: Date.now() + 60_000
	};
	const got = await pollForToken(fetchImpl, code, new AbortController().signal, 'Iv1.texpile0000', async (ms) => void waits.push(ms));
	expect(got).toEqual({ token: 'gho_token' });
	expect(waits).toEqual([5_000, 5_000, 10_000, 10_000]);
	expect(new URLSearchParams(calls[0].body).get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
});

it('stops on a declined or expired code, and when cancelled', async () => {
	const code = {
		deviceCode: 'dev',
		userCode: 'A',
		verificationUri: 'https://github.com/login/device',
		interval: 1,
		expiresAt: Date.now() + 60_000
	};
	expect(await pollForToken(scripted([{ error: 'access_denied' }]).fetchImpl, code, new AbortController().signal, 'x', noSleep)).toEqual({
		failure: 'denied'
	});
	expect(await pollForToken(scripted([{ error: 'expired_token' }]).fetchImpl, code, new AbortController().signal, 'x', noSleep)).toEqual({
		failure: 'expired'
	});
	const abort = new AbortController();
	abort.abort();
	expect(await pollForToken(scripted([]).fetchImpl, code, abort.signal, 'x', noSleep)).toEqual({ failure: 'cancelled' });
	expect(
		await pollForToken(scripted([]).fetchImpl, { ...code, expiresAt: Date.now() - 1 }, new AbortController().signal, 'x', noSleep)
	).toEqual({ failure: 'expired' });
	// Cancel while a request is out: the token that comes back with it is not kept
	const late = new AbortController();
	const inFlight = async () => {
		late.abort();
		return { ok: true, status: 200, json: async () => ({ access_token: 'gho_late' }), text: async () => '' };
	};
	expect(await pollForToken(inFlight, code, late.signal, 'x', noSleep)).toEqual({ failure: 'cancelled' });
});

it('learns whose token it is, and is not offered without a client ID', async () => {
	expect(await accountOf(scripted([{ login: 'ada', id: 42 }]).fetchImpl, 't')).toEqual({ login: 'ada', id: 42 });
	expect(githubSignInAvailable('')).toBe(false);
	expect(githubSignInAvailable('Iv1.texpile0000')).toBe(true);
});

it('knows when an expiring token has run out, and that the others never do', async () => {
	const code = {
		deviceCode: 'dev',
		userCode: 'A',
		verificationUri: 'https://github.com/login/device',
		interval: 1,
		expiresAt: Date.now() + 60_000
	};
	expect(
		await pollForToken(scripted([{ access_token: 't', expires_in: 28_800 }]).fetchImpl, code, new AbortController().signal, 'x', noSleep)
	).toEqual({
		token: 't',
		expiresIn: 28_800
	});
	const session = { token: 't', login: 'ada', id: 1, scopes: [] };
	expect(sessionExpired(session)).toBe(false);
	expect(sessionExpired({ ...session, expiresAt: 100_000 }, 30_000)).toBe(false);
	expect(sessionExpired({ ...session, expiresAt: 100_000 }, 45_000)).toBe(true);
});

it('ships with Texpile’s own OAuth app', async () => {
	const { GITHUB_CLIENT_ID } = await import('../../../../../../../electron/src/git/auth/githubAuthConfig');
	expect(githubSignInAvailable(GITHUB_CLIENT_ID)).toBe(true);
});
