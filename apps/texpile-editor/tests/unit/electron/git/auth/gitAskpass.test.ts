// The askpass bridge from git's side: git runs the script, the script asks a socket, and the answer
// comes back as what git reads. The app's end of the socket needs Electron, so a stand-in speaks the
// same one-line JSON protocol here; plain node runs askpass-main.js where the app runs its own binary
// with ELECTRON_RUN_AS_NODE.
//
// `git credential fill` with no helper configured is the cheapest way to make git ask: it asks for
// a username and a password exactly as a push to an https remote would.
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	describePrompt,
	isGithubHttpsPrompt,
	writeAskpassScripts,
	askpassEnv
} from '../../../../../../../electron/src/git/auth/gitAskpassClient';
import { gitCredentialFill } from '../../../../../../../electron/src/git/remote/gitRemote';

function hasGitAndSh(): boolean {
	if (process.platform === 'win32') return false; // the script is sh; Git for Windows brings its own
	try {
		execFileSync('git', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

describe('reading what git and ssh ask', () => {
	it('tells a username from a password, and finds the host', () => {
		expect(describePrompt('https', "Username for 'https://github.com': ")).toEqual({
			input: 'text',
			subject: 'username',
			prompt: "Username for 'https://github.com':",
			host: 'github.com'
		});
		expect(describePrompt('https', "Password for 'https://ada@gitlab.example.org:8443': ")).toMatchObject({
			input: 'secret',
			subject: 'password',
			host: 'gitlab.example.org'
		});
	});

	it('lets the GitHub account answer only https://github.com itself', () => {
		expect(isGithubHttpsPrompt("Username for 'https://github.com': ")).toBe(true);
		expect(isGithubHttpsPrompt("Password for 'https://ada@github.com': ")).toBe(true);
		// plain http would carry the token in the clear; another port is another server
		expect(isGithubHttpsPrompt("Password for 'http://ada@github.com': ")).toBe(false);
		expect(isGithubHttpsPrompt("Password for 'https://ada@github.com:8443': ")).toBe(false);
		expect(isGithubHttpsPrompt("Password for 'https://ada@github.com.example.org': ")).toBe(false);
		// a quote in the username (git without prompt sanitising) must not pass another host off as github.com
		const forged = "Password for 'https://github.com'@evil.example.org': ";
		expect(isGithubHttpsPrompt(forged)).toBe(false);
		expect(describePrompt('https', forged)).toMatchObject({ subject: 'password', host: null });
		// nor a slash: https://github.com%2F@evil.example.org asked about unsanitised
		const slashed = "Password for 'https://github.com/@evil.example.org': ";
		expect(isGithubHttpsPrompt(slashed)).toBe(false);
		expect(describePrompt('https', slashed)).toMatchObject({ host: 'evil.example.org' });
		expect(isGithubHttpsPrompt("Password for 'https://github.com/x@evil.example.org/repo.git': ")).toBe(false);
		expect(isGithubHttpsPrompt("Password for 'https://ada@github.com/org/thesis.git': ")).toBe(true);
	});

	it("reads ssh's passphrase, password and new-host questions", () => {
		expect(describePrompt('ssh', "Enter passphrase for key '/home/ada/.ssh/id_ed25519': ")).toMatchObject({
			input: 'secret',
			subject: 'passphrase',
			host: null
		});
		expect(describePrompt('ssh', "git@example.org's password: ")).toMatchObject({
			input: 'secret',
			subject: 'password',
			host: 'example.org'
		});
		const hostKey =
			"The authenticity of host 'github.com (140.82.121.4)' can't be established.\nED25519 key fingerprint is SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU.\nAre you sure you want to continue connecting (yes/no/[fingerprint])? ";
		expect(describePrompt('ssh', hostKey)).toMatchObject({ input: 'confirm', subject: 'host-key', host: 'github.com' });
		expect(describePrompt('ssh', 'Allow use of key?', 'confirm')).toMatchObject({ input: 'confirm' });
	});
});

describe.skipIf(!hasGitAndSh())('answering git through the bridge', () => {
	let server: Server | null = null;
	let dir = '';
	const saved = { global: process.env.GIT_CONFIG_GLOBAL, nosystem: process.env.GIT_CONFIG_NOSYSTEM };
	afterEach(() => {
		server?.close();
		server = null;
		rmSync(dir, { recursive: true, force: true });
		for (const [name, value] of [
			['GIT_CONFIG_GLOBAL', saved.global],
			['GIT_CONFIG_NOSYSTEM', saved.nosystem]
		] as const) {
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	});

	/** a stand-in for the app's end: answers from `reply`, recording what was asked */
	async function bridge(reply: (req: { token: string; kind: string; prompt: string }) => string | null) {
		dir = mkdtempSync(join(tmpdir(), 'texpile-askpass-'));
		// no credential helper anywhere, so git has to ask; the system config is where macOS's
		// osxkeychain and a system-wide Credential Manager live, and they would answer with a real token
		process.env.GIT_CONFIG_NOSYSTEM = '1';
		process.env.GIT_CONFIG_GLOBAL = join(dir, 'empty.gitconfig');
		writeFileSync(process.env.GIT_CONFIG_GLOBAL, '');
		writeAskpassScripts(join(dir, 'scripts'));
		const asked: { token: string; kind: string; prompt: string }[] = [];
		const handle = join(dir, 'bridge.sock');
		server = createServer((socket) => {
			let buf = '';
			socket.setEncoding('utf8');
			socket.on('data', (chunk: string) => {
				buf += chunk;
				const nl = buf.indexOf('\n');
				if (nl === -1) return;
				const req = JSON.parse(buf.slice(0, nl)) as { token: string; kind: string; prompt: string };
				asked.push(req);
				const answer = reply(req);
				socket.end(JSON.stringify(answer === null ? { cancel: true } : { answer }) + '\n');
			});
		});
		await new Promise<void>((resolve) => server!.listen(handle, resolve));
		return { asked, env: askpassEnv(join(dir, 'scripts'), handle, 'secret-token', process.execPath) };
	}

	it("puts git's questions to the app and hands git its answers", async () => {
		const { asked, env } = await bridge((req) => (req.prompt.startsWith('Username') ? 'ada' : 'token with spaces & $ymbols'));
		const res = await gitCredentialFill(dir, 'github.com', env);
		expect(res.ok).toBe(true);
		expect(res.credential).toMatchObject({ username: 'ada', password: 'token with spaces & $ymbols' });
		expect(asked.map((q) => q.prompt)).toEqual(["Username for 'https://github.com': ", "Password for 'https://ada@github.com': "]);
		// the token is what the app checks before answering anything
		expect(asked.every((q) => q.token === 'secret-token' && q.kind === 'https')).toBe(true);
	});

	it('a cancelled question fails the git that asked, rather than sending an empty password', async () => {
		const { env } = await bridge(() => null);
		const res = await gitCredentialFill(dir, 'github.com', env);
		expect(res.ok).toBe(false);
	});
});
