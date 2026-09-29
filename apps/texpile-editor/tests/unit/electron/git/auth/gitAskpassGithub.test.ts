// The GitHub sign-in answers github.com's questions and nobody else's. After signing in in the
// browser the window asks for it by the question's id, so the main process has to check the host
// itself: a question from another server must never be answered with the GitHub token, whatever
// the window asks for. Electron is stood in for; the socket is the real one git's askpass talks to.
import { it, expect, vi, afterAll } from 'vitest';
import { connect } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const h = vi.hoisted(() => ({
	handlers: new Map<string, (...args: unknown[]) => unknown>(),
	userData: '',
	signedIn: null as { login: string; token: string } | null
}));
h.userData = mkdtempSync(join(tmpdir(), 'texpile-askpass-github-'));

vi.mock('electron', () => ({
	app: { getPath: () => h.userData, once: () => {} },
	ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(channel, fn) },
	safeStorage: { isEncryptionAvailable: () => false }
}));
vi.mock('../../../../../../../electron/src/git/auth/githubSession', () => ({
	githubSession: () => h.signedIn,
	forgetGithubSession: () => {},
	registerGithubAuthIpc: () => {}
}));
vi.mock('../../../../../../../electron/src/git/auth/githubAuth', () => ({ githubSignInAvailable: () => true }));

import { withAskpass, registerAskpassIpc } from '../../../../../../../electron/src/git/auth/gitAskpass';

afterAll(() => rmSync(h.userData, { recursive: true, force: true }));

type Asked = { id: number; host: string | null; github?: boolean };

/** a window that records the questions put to it */
function fakeWindow() {
	const asked: Asked[] = [];
	let notify: (() => void) | null = null;
	const sender = {
		send: (channel: string, payload: Asked) => {
			if (channel !== 'git:askpass') return;
			asked.push(payload);
			notify?.();
		},
		isDestroyed: () => false,
		once: () => {},
		removeListener: () => {}
	};
	const next = () => new Promise<Asked>((resolve) => (notify = () => resolve(asked[asked.length - 1])));
	return { sender, next };
}

/** what git's askpass script does: one line of JSON in, one line of JSON back */
function ask(env: Record<string, string>, prompt: string): Promise<{ answer?: string; cancel?: boolean }> {
	return new Promise((resolve, reject) => {
		const socket = connect(env.TEXPILE_ASKPASS_HANDLE);
		let buf = '';
		socket.setEncoding('utf8');
		socket.on('data', (chunk: string) => (buf += chunk));
		socket.on('end', () => resolve(JSON.parse(buf) as { answer?: string; cancel?: boolean }));
		socket.on('error', reject);
		socket.write(JSON.stringify({ token: env.TEXPILE_ASKPASS_TOKEN, kind: 'https', prompt }) + '\n');
	});
}

registerAskpassIpc();
const useGithub = (sender: unknown, id: number) => h.handlers.get('git:askpassUseGithub')!({ sender }, id);
const reply = (sender: unknown, id: number, answer: string | null) => h.handlers.get('git:askpassReply')!({ sender }, id, answer);

it.skipIf(process.platform === 'win32')('never answers another server with the GitHub token', async () => {
	h.signedIn = { login: 'ada', token: 'gho_SECRET' };
	const { sender, next } = fakeWindow();
	await withAskpass(sender as never, async (env) => {
		const shown = next();
		const answered = ask(env, "Password for 'https://ada@elsewhere.example': ");
		const q = await shown;
		expect(q).toMatchObject({ host: 'elsewhere.example', github: false });
		// the window asks for the GitHub answer anyway
		expect(useGithub(sender, q.id)).toBe(false);
		reply(sender, q.id, null);
		expect(await answered).toEqual({ cancel: true });
		return { ok: false };
	});
});

it.skipIf(process.platform === 'win32')("answers github.com's question once the window has signed in", async () => {
	h.signedIn = null; // signed out when git asks, so the question goes to the window
	const { sender, next } = fakeWindow();
	await withAskpass(sender as never, async (env) => {
		const shown = next();
		const answered = ask(env, "Password for 'https://ada@github.com': ");
		const q = await shown;
		expect(q).toMatchObject({ host: 'github.com', github: true });
		h.signedIn = { login: 'ada', token: 'gho_SECRET' }; // signed in in the browser
		expect(useGithub(sender, q.id)).toBe(true);
		expect(await answered).toEqual({ answer: 'gho_SECRET' });
		return { ok: true };
	});
});
