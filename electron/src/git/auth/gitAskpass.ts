// git's credential questions, asked in the window. VS Code's askpass, the same way round: git (or
// ssh) runs GIT_ASKPASS / SSH_ASKPASS with the question as its argument, that script runs a small
// node program under Electron (ELECTRON_RUN_AS_NODE) which asks this process over a local socket,
// and the question goes to the window that started the operation. The answer travels back the same
// way and git reads it from the script's output.
//
// Without it, a push that needs a password fails with "terminal prompts disabled" unless a
// credential manager happens to hold one - which on macOS and Linux it usually does not yet the
// first time. Git's own helpers still come first: git only asks here when they have nothing.
import { app, ipcMain, type WebContents } from 'electron';
import { createServer, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { chmodSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describePrompt, isGithubHttpsPrompt, writeAskpassScripts, askpassEnv } from './gitAskpassClient';
import type { GitAuthEnv } from '../remote/gitRemote';
import { SignIns, keepable, keychainVault, memoryVault, refusedPassword, settle } from './gitSignIns';
import { forgetGithubSession, githubSession, registerGithubAuthIpc } from './githubSession';
import { githubSignInAvailable } from './githubAuth';

/** One operation's worth of questions. `answers` is why a sign-in is typed once: publishing to
 *  GitHub reads the credential and then pushes with it, and git asks the same two questions both
 *  times. It lives exactly as long as the operation. */
type Session = {
	sender: WebContents;
	cancelled: boolean;
	answers: Map<string, string>;
	/** sign-ins typed this time, kept if the operation works (gitSignIns.ts) */
	typed: Map<string, string>;
	/** sign-ins answered from the keychain, forgotten if the operation is refused */
	recalled: Set<string>;
	/** a github.com question was answered with the GitHub sign-in's token */
	usedGithub: boolean;
	/** the automatic check: answered from sign-ins already held, never by asking */
	quiet: boolean;
};

let signIns: SignIns | null = null;
/** made on first use: safeStorage needs the app ready */
function signInStore(): SignIns {
	if (!signIns) {
		const keychain = keychainVault();
		signIns = keychain ? new SignIns(keychain) : new SignIns(memoryVault(), false);
	}
	return signIns;
}

/** Preferences' Forget saved sign-ins */
export function forgetSignIns(): void {
	signInStore().forgetAll();
}

const sessions = new Map<string, Session>();
/** `github`: a github.com username or password question, the only kind the GitHub sign-in may answer */
const waiting = new Map<number, { session: Session; subject: string; github: boolean; resolve: (answer: string | null) => void }>();
let nextId = 1;
let bridge: Promise<{ dir: string; handle: string } | null> | null = null;

function ensureBridge(): Promise<{ dir: string; handle: string } | null> {
	bridge ??= (async () => {
		try {
			const dir = join(app.getPath('userData'), 'askpass');
			writeAskpassScripts(dir);
			// a socket path is capped near 104 bytes on macOS, which a home directory can eat into,
			// so the socket lives in the temp directory under a short random name
			const id = randomBytes(8).toString('hex');
			const handle = process.platform === 'win32' ? `\\\\.\\pipe\\texpile-askpass-${id}` : join(tmpdir(), `texpile-askpass-${id}.sock`);
			const server = createServer(onConnection);
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(handle, () => resolve());
			});
			// the per-operation token is what authorises a question; this keeps other users from even asking
			if (process.platform !== 'win32') chmodSync(handle, 0o600);
			app.once('will-quit', () => {
				server.close();
				if (process.platform !== 'win32') rmSync(handle, { force: true });
			});
			return { dir, handle };
		} catch {
			// no bridge: git still has its credential helpers, which is where things stood before it
			return null;
		}
	})();
	return bridge;
}

function onConnection(socket: Socket): void {
	let buf = '';
	socket.setEncoding('utf8');
	socket.on('error', () => {});
	socket.on('data', (chunk: string) => {
		buf += chunk;
		const nl = buf.indexOf('\n');
		if (nl === -1) {
			if (buf.length > 64 * 1024) socket.destroy();
			return;
		}
		let req: { token?: unknown; kind?: unknown; prompt?: unknown; promptType?: unknown };
		try {
			req = JSON.parse(buf.slice(0, nl)) as typeof req;
		} catch {
			socket.destroy();
			return;
		}
		socket.removeAllListeners('data');
		void answer(req).then((a) => {
			if (!socket.destroyed) socket.end(JSON.stringify(a === null ? { cancel: true } : { answer: a }) + '\n');
		});
	});
}

async function answer(req: { token?: unknown; kind?: unknown; prompt?: unknown; promptType?: unknown }): Promise<string | null> {
	const session = typeof req.token === 'string' ? sessions.get(req.token) : undefined;
	if (!session || typeof req.prompt !== 'string') return null;
	// one Cancel answers the rest of the operation: git asks for the password after a cancelled
	// username, and a second dialog would read as the first one not having worked
	if (session.cancelled || session.sender.isDestroyed()) return null;
	const cached = session.answers.get(req.prompt);
	if (cached !== undefined) return cached;

	const promptType = typeof req.promptType === 'string' ? req.promptType : '';
	// ssh's notices ("confirm user presence for key ...") want no answer and are not waited on
	if (promptType === 'none') return '';
	const request = describePrompt(req.kind === 'ssh' ? 'ssh' : 'https', req.prompt, promptType);
	const keep = req.kind !== 'ssh' && keepable(request.subject);
	// VS Code's GitHub credential provider: the signed-in account answers github.com's questions
	const forGithub = keep && isGithubHttpsPrompt(req.prompt);
	const signedIn = forGithub ? githubAnswer(request.subject) : null;
	if (signedIn !== null) {
		session.usedGithub = true;
		session.answers.set(req.prompt, signedIn);
		return signedIn;
	}
	if (keep) {
		const kept = signInStore().recall(req.prompt);
		if (kept !== null) {
			session.recalled.add(req.prompt);
			session.answers.set(req.prompt, kept);
			return kept;
		}
	}
	// Nobody asked for the automatic check, so nobody is asked: a question the sign-ins held cannot
	// answer ends it, as VS Code's silent fetch does (which answers none, not even its GitHub one)
	if (session.quiet) {
		session.cancelled = true;
		return null;
	}
	const id = nextId++;
	const reply = await new Promise<string | null>((resolve) => {
		waiting.set(id, { session, subject: request.subject, github: forGithub, resolve });
		// `github`: the question can be answered by signing in to GitHub in the browser instead
		session.sender.send('git:askpass', {
			id,
			...request,
			github: forGithub && githubSignInAvailable()
		});
	});
	if (reply === null) {
		session.cancelled = true;
		return null;
	}
	session.answers.set(req.prompt, reply);
	if (keep) session.typed.set(req.prompt, reply);
	return reply;
}

/** the signed-in GitHub account's answer to a username or password question; null when signed out */
function githubAnswer(subject: string): string | null {
	const signed = githubSession();
	if (!signed) return null;
	return subject === 'username' ? signed.login : subject === 'password' ? signed.token : null;
}

function dropQuestions(session: Session): void {
	const dropped: number[] = [];
	for (const [id, w] of waiting) {
		if (w.session !== session) continue;
		waiting.delete(id);
		dropped.push(id);
		w.resolve(null);
	}
	// the window may still be showing one: tell it those questions are gone
	if (dropped.length && !session.sender.isDestroyed()) session.sender.send('git:askpassClosed', dropped);
}

/**
 * Run a git operation that may need to sign in, with its questions routed to `sender`'s window.
 * `op` gets the environment that points git at the bridge; it is passed to the helper process with
 * the call. A result that failed after the author closed the prompt comes back as 'cancelled'.
 */
export async function withAskpass<T extends { ok: boolean; failure?: string; error?: string }>(
	sender: WebContents,
	op: (env: GitAuthEnv) => Promise<T>,
	opts: { quiet?: boolean } = {}
): Promise<T> {
	// the automatic check asks no one, a credential helper with windows of its own included: Git
	// Credential Manager (Git for Windows' default) opens its sign-in unless told not to
	const quietEnv: GitAuthEnv = opts.quiet ? { GCM_INTERACTIVE: 'never' } : {};
	const b = await ensureBridge();
	if (!b) return op(quietEnv);
	const token = randomBytes(24).toString('hex');
	const session: Session = {
		sender,
		cancelled: false,
		answers: new Map(),
		typed: new Map(),
		recalled: new Set(),
		usedGithub: false,
		quiet: !!opts.quiet
	};
	sessions.set(token, session);
	function onGone() {
		dropQuestions(session);
	}
	sender.once('destroyed', onGone);
	try {
		const result = await op({ ...askpassEnv(b.dir, b.handle, token, process.execPath), ...quietEnv });
		// kept only once they worked; a kept one that was refused is dropped, so the next try asks.
		// A question left unanswered says nothing about the answers before it.
		if (!session.cancelled) settle(signInStore(), result, session.typed, session.recalled);
		// a token GitHub refused (revoked, expired) is signed out, so the next try asks again
		if (session.usedGithub && refusedPassword(result)) forgetGithubSession();
		return !result.ok && session.cancelled ? { ...result, failure: 'cancelled' } : result;
	} finally {
		sessions.delete(token);
		dropQuestions(session);
		if (!sender.isDestroyed()) sender.removeListener('destroyed', onGone);
	}
}

export function registerAskpassIpc(): void {
	ipcMain.handle('git:forgetSignIns', () => {
		forgetSignIns();
		return true;
	});
	registerGithubAuthIpc(signInStore);
	// the question answered by the GitHub sign-in the window just completed: the token is read here
	ipcMain.handle('git:askpassUseGithub', (e, id: unknown) => {
		const w = typeof id === 'number' ? waiting.get(id) : undefined;
		// the token goes only to github.com: never to another host's question, whatever the window asks
		if (!w || w.session.sender !== e.sender || !w.github) return false;
		const answer = githubAnswer(w.subject);
		if (answer === null) return false;
		waiting.delete(id as number);
		w.session.usedGithub = true;
		w.resolve(answer);
		return true;
	});
	// null (or anything not a string) is Cancel. Only the window that was asked can answer.
	ipcMain.handle('git:askpassReply', (e, id: unknown, reply: unknown) => {
		const w = typeof id === 'number' ? waiting.get(id) : undefined;
		if (!w || w.session.sender !== e.sender) return false;
		waiting.delete(id as number);
		w.resolve(typeof reply === 'string' ? reply : null);
		return true;
	});
}
