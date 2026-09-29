// The Source Control panel's remote half: publishing a branch, uploading, syncing, and the
// credentials all three sign in with. Split from gitService.ts, whose repo-root resolution and
// command factory it shares; the helper process serves both (helper/helperWorker.ts).
import { simpleGit, type SimpleGit, type SimpleGitOptions } from 'simple-git';
import { spawn } from 'node:child_process';
import { git, isMissingGit, errMsg, resolveRepoRoot, retryLocked, upstreamExists, type GitOpResult } from '../gitService';

// -- remotes --------------------------------------------------------------------

/** Why an upload did not happen. 'failed to push some refs' is the same sentence for all of them
 *  and the difference is the only part an author can act on. 'cancelled' is the author closing the
 *  sign-in prompt, an answer rather than a failure; main sets it (gitAskpass.ts), since only main
 *  saw the prompt. */
/** 'secret': GitHub's push protection found what looks like a password or key in a version.
 *  'protected': the branch only takes changes a rule allows (a pull request, a review). */
export type PushFailure = 'no-upstream' | 'rejected' | 'auth' | 'forbidden' | 'secret' | 'protected' | 'network' | 'cancelled' | 'other';

export type GitPushResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	failure?: PushFailure;
	/** the remote it went to, or would have, so the message can name it */
	remote?: string;
};

// checked in this order: a 403 from a host says both 'unable to access' and a permissions phrase,
// and it is a permission problem, not a network one. 'forbidden' is a sign-in that worked for an
// account that may not write here - someone else's repository, whose owner can add them - and is
// kept apart from 'auth', a password or token the host did not accept.
const FORBIDDEN_RE = /permission to \S+ denied|returned error: 403/i;
// GH009 and GH013 are GitHub's push protection; GH006 and the rest of GH013 are branch rules
const SECRET_RE = /GH009|push cannot contain secrets|secret scanning/i;
const PROTECTED_RE = /GH006|GH013|protected branch|repository rule violations/i;
const AUTH_RE =
	/authentication failed|could not read (username|password)|invalid username or password|permission denied|permission to .* denied|terminal prompts disabled|returned error: 40[13]|access denied|no such identity|host key verification failed/i;
const REJECTED_RE = /non-fast-forward|fetch first|updates were rejected|\[rejected\]|behind its remote/i;
const NETWORK_RE =
	/could not resolve host|connection (timed out|refused|reset)|network is unreachable|failed to connect|operation timed out|unable to access|proxy/i;

/** exported for the tests: this is the whole difference between a message worth reading and one
 *  that sends an author to a search engine */
export function classifyPushError(message: string): PushFailure {
	// GitHub's rule refusals come first: they arrive with a valid sign-in, and say so in words of their own
	if (SECRET_RE.test(message)) return 'secret';
	if (PROTECTED_RE.test(message)) return 'protected';
	if (FORBIDDEN_RE.test(message)) return 'forbidden';
	if (AUTH_RE.test(message)) return 'auth';
	if (REJECTED_RE.test(message)) return 'rejected';
	if (NETWORK_RE.test(message)) return 'network';
	return 'other';
}

/** Added to the environment of a git that talks to a remote: the askpass bridge (gitAskpass.ts),
 *  which puts git's username, password and passphrase questions in the window instead of a
 *  terminal nobody can see. Empty where there is no window to ask in, as in the tests. */
export type GitAuthEnv = Record<string, string>;

// simple-git screens an explicit environment and refuses one that names an editor, a pager, a
// config path, an ssh command, GIT_CONFIG_* pairs or PREFIX (npm sets it), among others. That
// screen is for environments built from untrusted input. This one is the author's own - the same
// one every other git here inherits by passing none - plus the askpass variables set above, and
// the arguments that go with it are fixed here, with the only free text (a remote's name and
// address) checked by isRemoteName / isRemoteUrl before it gets near them.
export const OWN_ENVIRONMENT: SimpleGitOptions['unsafe'] = {
	allowUnsafeAlias: true,
	allowUnsafeAskPass: true,
	allowUnsafeConfigPaths: true,
	allowUnsafeConfigEnvCount: true,
	allowUnsafeCredentialHelper: true,
	allowUnsafeEditor: true,
	allowUnsafeMergeDriver: true,
	allowUnsafePager: true,
	allowUnsafeSshCommand: true,
	allowUnsafeGitProxy: true,
	allowUnsafeHooksPath: true,
	allowUnsafeDiffExternal: true,
	allowUnsafeDiffTextConv: true,
	allowUnsafeFilter: true,
	allowUnsafeFsMonitor: true,
	allowUnsafeGpgProgram: true,
	allowUnsafeTemplateDir: true
};

/** The whole environment, not only what is added to it. An environment of just
 *  GIT_TERMINAL_PROMPT has no HOME, so git read no ~/.gitconfig: a credential helper, an
 *  `insteadOf` or an identity configured there silently did not exist for an upload.
 *
 *  GIT_TERMINAL_PROMPT=0 because there is no terminal to prompt on: with no credential helper and
 *  no askpass, git would otherwise wait for ever on a question nobody can see. */
export function netEnv(auth: GitAuthEnv): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
	return { ...env, GIT_TERMINAL_PROMPT: '0', ...auth };
}

/** Talking to a remote waits on things nothing else here does: a sign-in someone has to type, and
 *  a transfer over their connection. The shared factory kills a command after 20s of silence, which
 *  is exactly what a password prompt looks like from the outside, so this one has no block timeout.
 *  `stall`, for a git nobody is waiting to sign in to (the automatic check): how long it may go
 *  without a word before it is stopped. */
export function netGit(baseDir: string, auth: GitAuthEnv = {}, stall = 0): SimpleGit {
	return simpleGit({
		baseDir,
		binary: 'git',
		maxConcurrentProcesses: 1,
		config: ['core.quotePath=false'],
		unsafe: OWN_ENVIRONMENT,
		...(stall > 0 && { timeout: { block: stall } })
	}).env(netEnv(auth));
}

/** A remote's name ends up in refs and config keys; git's own rules are looser, these are the ones
 *  worth typing. Exported for the tests. */
export function isRemoteName(name: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) && !name.endsWith('.lock') && !name.includes('..');
}

/** An address is a positional argument, so one starting with '-' would be read as an option, and
 *  the `ext::` and `fd::` transports run commands rather than fetch anything. Exported for the tests. */
export function isRemoteUrl(url: string): boolean {
	const u = url.trim();
	return !!u && !u.startsWith('-') && !/\s/.test(u) && !/^(ext|fd)::/i.test(u);
}

/** the remote and the branch on it that this branch tracks, read from config: splitting
 *  'origin/feature/x' cannot tell a remote called 'a/b' from a branch called 'b/x' */
export async function upstreamOf(g: SimpleGit, branch: string): Promise<{ remote: string; ref: string } | null> {
	// a missing key exits 1 with nothing on stderr, which simple-git resolves as ''
	const remote = (await g.raw(['config', '--get', `branch.${branch}.remote`])).trim();
	const merge = (await g.raw(['config', '--get', `branch.${branch}.merge`])).trim();
	if (!remote || !merge) return null;
	return { remote, ref: merge.replace(/^refs\/heads\//, '') };
}

export type GitRemote = { name: string; url: string };

export type GitRemotesResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	remotes?: GitRemote[];
};

/** an http(s) address without its user part, where a token can sit (https://<token>@github.com) */
export function withoutSignIn(url: string): string {
	return url.replace(/^(https?:\/\/)[^/]*@/i, '$1');
}

/** the remotes this repository knows, for choosing where a branch is published. The window gets
 *  each address without a sign-in in it: it shows them. */
export async function gitRemotes(workspaceRoot: string): Promise<GitRemotesResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	try {
		const list = await git(rr.repo.root).getRemotes(true);
		return { ok: true, remotes: list.map((r) => ({ name: r.name, url: withoutSignIn(r.refs.push || r.refs.fetch) })) };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/** record a remote under `name`; nothing is sent until the branch is published to it. */
export async function gitAddRemote(workspaceRoot: string, name: string, url: string): Promise<GitOpResult> {
	if (!isRemoteName(name)) return { ok: false, error: `"${name}" cannot be the name of a remote` };
	if (!isRemoteUrl(url)) return { ok: false, error: 'That is not the address of a repository' };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	try {
		await git(rr.repo.root).addRemote(name, url.trim());
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

// -- upload ---------------------------------------------------------------------

/**
 * Send this branch's versions to the upstream it already tracks.
 *
 * Push only: it never fetches, merges or rebases, so it cannot rewrite anyone's files. A remote
 * that has moved on is reported and left alone; taking its versions in is gitSync's job.
 */
export async function gitPush(workspaceRoot: string, auth: GitAuthEnv = {}): Promise<GitPushResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	let remote: string | undefined;
	try {
		const g = netGit(rr.repo.root, auth);
		const status = await g.status();
		// a branch tracking nothing has nowhere to go; giving it somewhere is gitPublish
		if (!status.tracking || !status.current) return { ok: false, failure: 'no-upstream' };
		const up = await upstreamOf(g, status.current);
		if (!up) return { ok: false, failure: 'no-upstream' };
		remote = up.remote;
		// explicit refspec: `git push` alone refuses when the upstream branch is named differently
		await pushBranch(g, up.remote, status.current, up.ref);
		return { ok: true, remote };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		const msg = errMsg(e);
		return { ok: false, failure: classifyPushError(msg), error: msg, remote };
	}
}

/**
 * Send this branch to `remote` for the first time and make it the branch's upstream (`push -u`),
 * under the same name there. VS Code's Publish Branch: afterwards Upload and Sync have somewhere
 * to go.
 */
export async function gitPublish(workspaceRoot: string, remote: string, auth: GitAuthEnv = {}): Promise<GitPushResult> {
	if (!isRemoteName(remote)) return { ok: false, failure: 'other', error: `"${remote}" is not a remote` };
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	try {
		const g = netGit(rr.repo.root, auth);
		const status = await g.status();
		if (!status.current || status.detached) return { ok: false, failure: 'other', error: 'There is no branch to publish.', remote };
		await pushBranch(g, remote, status.current, status.current, ['--set-upstream']);
		return { ok: true, remote };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		const msg = errMsg(e);
		return { ok: false, failure: classifyPushError(msg), error: msg, remote };
	}
}

// -- sync -----------------------------------------------------------------------

/** 'conflict': both sides changed the same lines, and the attempt was undone. 'dirty': work that
 *  is not saved as a version is in the way, and nothing was attempted. */
export type SyncFailure = PushFailure | 'conflict' | 'dirty';

export type GitSyncResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	error?: string;
	failure?: SyncFailure;
	remote?: string;
	/** versions taken in from the remote */
	pulled?: number;
	/** versions sent to it */
	pushed?: number;
	/** what stood in the way of a 'conflict' or a 'dirty', repo-relative */
	files?: string[];
};

export const OVERWRITE_RE = /would be overwritten by (merge|checkout)/i;

/** The files git lists under "...would be overwritten by merge:", one per indented line.
 *  Exported for the tests. */
export function parseBlockingFiles(message: string): string[] {
	const out: string[] = [];
	let listing = false;
	for (const line of message.split('\n')) {
		if (OVERWRITE_RE.test(line)) {
			listing = true;
			continue;
		}
		if (!listing) continue;
		// the list is tab-indented; the first unindented line ("Please commit your changes...") ends it
		if (/^\s+\S/.test(line)) out.push(line.trim());
		else if (line.trim()) listing = false;
	}
	return out;
}

/** [ahead, behind] against the upstream, from local refs */
export async function aheadBehind(g: SimpleGit): Promise<[number, number]> {
	const [a, b] = (await g.raw(['rev-list', '--left-right', '--count', 'HEAD...@{u}'])).trim().split(/\s+/);
	return [Number(a) || 0, Number(b) || 0];
}

export async function mergeInProgress(g: SimpleGit): Promise<boolean> {
	return (await g.raw(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).trim() !== '';
}

/** what a git command printed, whether it worked or not: for a merge, the state it leaves behind is
 *  the answer, and its words only explain it */
export async function outputOf(run: Promise<string>): Promise<string> {
	try {
		return await run;
	} catch (e) {
		return errMsg(e);
	}
}

/** `-m` and the message for a merge, or nothing for git's own: what arrives over IPC is checked */
export function mergeMessage(message: unknown): string[] {
	const text = typeof message === 'string' ? message.trim() : '';
	return text ? ['-m', text] : [];
}

type TakeIn = { ok: true } | { ok: false; failure: SyncFailure; error?: string; files?: string[] };

/** Bring the upstream's commits into this branch, or leave everything exactly as it was. A merge
 *  commit gets `message`, or git's own ("Merge remote-tracking branch 'origin/main'") without one. */
/**
 * Uncommitted work that has to be saved before a merge with `upstream`: in a file the other side
 * changed too, since `merge --abort` cannot always rebuild it and undoing the attempt completely is
 * the promise, or staged anywhere, which git will not merge over. Work in any other file stays
 * uncommitted, which is what a file unticked to stay on this computer needs: the merge does not
 * touch it and an abort (reset --merge) keeps it. Repo-relative.
 */
export async function mergeBlockers(g: SimpleGit, upstream: string): Promise<string[]> {
	const status = (await g.status(['--untracked-files=no'])).files;
	const theirs = new Set((await g.raw(['diff', '--name-only', '--no-renames', '-z', `HEAD...${upstream}`])).split('\0'));
	return status.filter((f) => theirs.has(f.path) || (f.index !== ' ' && f.index !== '?')).map((f) => f.path);
}

async function takeIn(g: SimpleGit, diverged: boolean, message: string): Promise<TakeIn> {
	if (!diverged) {
		// nothing here the remote lacks: move forward to it. Git refuses, touching nothing, when a
		// file it would change has unsaved work in it.
		const msg = await outputOf(retryLocked(() => g.raw(['merge', '--ff-only', '@{u}'])));
		if (OVERWRITE_RE.test(msg)) return { ok: false, failure: 'dirty', files: parseBlockingFiles(msg), error: msg };
		const [, behind] = await aheadBehind(g);
		return behind === 0 ? { ok: true } : { ok: false, failure: 'other', error: msg || 'git did not move to the new versions' };
	}

	// Both sides have versions the other lacks, so they are joined by a merge
	const inTheWay = await mergeBlockers(g, '@{u}');
	if (inTheWay.length) return { ok: false, failure: 'dirty', files: inTheWay };

	// a conflict exits 1 with its report on stdout, which simple-git resolves rather than throws
	const msg = await outputOf(retryLocked(() => g.raw(['merge', '--no-edit', ...mergeMessage(message), '@{u}'])));
	if (await mergeInProgress(g)) {
		const conflicted = (await g.status()).conflicted;
		await retryLocked(() => g.raw(['merge', '--abort']));
		return conflicted.length
			? { ok: false, failure: 'conflict', files: conflicted, error: msg }
			: { ok: false, failure: 'other', error: msg };
	}
	if (OVERWRITE_RE.test(msg)) return { ok: false, failure: 'dirty', files: parseBlockingFiles(msg), error: msg };
	const [, behind] = await aheadBehind(g);
	return behind === 0 ? { ok: true } : { ok: false, failure: 'other', error: msg || 'git did not join the two histories' };
}

/** Send `branch` to `remote` as `target`. Both refs are named in full: a tag or a branch elsewhere
 *  with the same short name would make git refuse the upload as ambiguous. */
async function pushBranch(g: SimpleGit, remote: string, branch: string, target: string, opts: string[] = []): Promise<void> {
	await g.raw(['push', ...opts, '--', remote, `refs/heads/${branch}:refs/heads/${target}`]);
}

/**
 * Bring this branch level with its upstream: fetch, take in what the remote has, then send what it
 * does not. VS Code's Sync, with one difference that matters to someone who does not use git: it
 * never leaves the project half-combined. When both sides changed the same lines the merge is
 * undone and the conflicting files are named; when unsaved work is in the way nothing is tried.
 * `message` is the merge commit's; without one, git's own is used, as the editor leaves it.
 */
export async function gitSync(workspaceRoot: string, message = '', auth: GitAuthEnv = {}): Promise<GitSyncResult> {
	const rr = await resolveRepoRoot(workspaceRoot);
	if (!rr.repo) return { ok: false, reason: rr.reason };
	const repo = rr.repo;
	const g = netGit(repo.root, auth);
	let remote: string | undefined;
	let stage: 'fetch' | 'merge' | 'push' = 'fetch';
	try {
		const status = await g.status();
		if (!status.current || status.detached || !status.tracking) return { ok: false, failure: 'no-upstream' };
		const up = await upstreamOf(g, status.current);
		if (!up) return { ok: false, failure: 'no-upstream' };
		remote = up.remote;

		// --prune, as in gitFetch.ts: an upstream deleted there must read as gone, not be published again
		await g.raw(['fetch', '--prune', '--', up.remote]);
		// the branch was deleted on the remote (a merged pull request's) and the fetch pruned it:
		// there is nothing to sync with, and the panel offers Publish once it refreshes
		if (!(await upstreamExists(g))) return { ok: false, failure: 'no-upstream', remote };

		stage = 'merge';
		const [ahead, behind] = await aheadBehind(g);
		if (behind > 0) {
			const took = await takeIn(g, ahead > 0, message);
			// files in the way as absolute paths, as a branch switch and Combine give them: the panel
			// saves those very rows first (scmSaveFirst.ts)
			if (!took.ok) return { ...took, ...(took.failure === 'dirty' && { files: took.files?.map((f) => repo.fromGit(f)) }), remote };
		}

		stage = 'push';
		const [toSend] = await aheadBehind(g);
		// with nothing to send, Sync does not push at all, as in a clone the author cannot write to
		if (toSend > 0) await pushBranch(g, up.remote, status.current, up.ref);
		return { ok: true, remote, pulled: behind, pushed: toSend };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		const msg = errMsg(e);
		// a merge that throws before the abort above is a git failure, not a network one
		return { ok: false, failure: stage === 'merge' ? 'other' : classifyPushError(msg), error: msg, remote };
	}
}

// -- credentials ----------------------------------------------------------------

/** One credential as git's credential API spells it: protocol, host, username, password, and
 *  whatever else a helper added (an expiry, a refresh token), kept so it can be handed back
 *  whole to `approve` or `reject`. */
export type GitCredential = Record<string, string>;

export type GitCredentialResult = {
	ok: boolean;
	reason?: 'no-git';
	error?: string;
	credential?: GitCredential;
};

function credentialCall(cwd: string, action: 'fill' | 'approve' | 'reject', input: GitCredential, auth: GitAuthEnv): Promise<string> {
	const body =
		Object.entries(input)
			.map(([k, v]) => `${k}=${v}`)
			.join('\n') + '\n\n';
	return new Promise((resolvePromise, reject) => {
		const child = spawn('git', ['credential', action], { cwd, env: netEnv(auth), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
		let out = '';
		let err = '';
		child.stdout.on('data', (b: Buffer) => (out += b.toString('utf8')));
		child.stderr.on('data', (b: Buffer) => (err += b.toString('utf8')));
		child.on('error', reject);
		child.on('close', (code) =>
			code === 0 ? resolvePromise(out) : reject(new Error(err.trim() || `git credential ${action} exited with ${code}`))
		);
		child.stdin.end(body);
	});
}

/** a value git's credential protocol can carry: one line, no NUL */
function credentialSafe(c: GitCredential): boolean {
	return Object.entries(c).every(([k, v]) => /^[a-z_]+$/i.test(k) && !/[\n\r\0]/.test(v));
}

/** Exported for the tests: key=value lines, the format git prints a credential in. */
export function parseCredential(raw: string): GitCredential {
	const out: GitCredential = {};
	for (const line of raw.split('\n')) {
		const at = line.indexOf('=');
		if (at > 0) out[line.slice(0, at)] = line.slice(at + 1).replace(/\r$/, '');
	}
	return out;
}

/**
 * The credential git would use for `https://<host>`, asked the way a push asks: whatever helper the
 * author set up (a keychain, Git Credential Manager, `gh auth setup-git`), and failing those the
 * askpass bridge. A token someone already pushes with is found without asking for it again.
 */
export async function gitCredentialFill(workspaceRoot: string, host: string, auth: GitAuthEnv = {}): Promise<GitCredentialResult> {
	const query = { protocol: 'https', host };
	if (!credentialSafe(query)) return { ok: false, error: 'Invalid host' };
	try {
		const credential = parseCredential(await credentialCall(workspaceRoot, 'fill', query, auth));
		if (!credential.password) return { ok: false, error: 'No password was given' };
		return { ok: true, credential };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}

/** Tell the helpers a credential worked (they store it) or did not (they forget it). With no
 *  helper configured both are no-ops, which is git's behaviour too. */
export async function gitCredentialVerdict(workspaceRoot: string, credential: GitCredential, worked: boolean): Promise<GitOpResult> {
	if (!credentialSafe(credential)) return { ok: false, error: 'Invalid credential' };
	try {
		await credentialCall(workspaceRoot, worked ? 'approve' : 'reject', credential, {});
		return { ok: true };
	} catch (e) {
		if (isMissingGit(e)) return { ok: false, reason: 'no-git' };
		return { ok: false, error: errMsg(e) };
	}
}
