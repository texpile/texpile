// Every one of these failures reaches us as "failed to push some refs", and the four cases want
// four different things done: combine the histories, fix a credential, check the connection, or
// read git's own words. Getting the class wrong sends someone to fix the thing that is not broken.
//
// The strings are what git and the common hosts actually print. Authentication is the one case a
// local bare repo cannot provoke (gitPushLive.test.ts), so it is only ever covered here.
import { describe, it, expect } from 'vitest';
import { classifyPushError } from '../../../../../../../electron/src/git/remote/gitRemote';
import { uploadReason, secretLocations, secretAllowUrl } from '$lib/workspace/uploadReason';

const REJECTED = [
	"! [rejected]        master -> master (fetch first)\nerror: failed to push some refs to 'https://github.com/a/b.git'",
	'! [rejected]        master -> master (non-fast-forward)',
	'Updates were rejected because the remote contains work that you do not have locally.',
	'Updates were rejected because the tip of your current branch is behind its remote counterpart.'
];

const AUTH = [
	"remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/a/b.git/'",
	"fatal: could not read Username for 'https://github.com': terminal prompts disabled",
	'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
	'Host key verification failed.'
];

// signed in, as an account that may not write here: someone else's repository, whose owner can
// add them, or a token without write permission
const FORBIDDEN = [
	"remote: Permission to a/b.git denied to someone.\nfatal: unable to access 'https://github.com/a/b.git/': The requested URL returned error: 403",
	'remote: Permission to a/b.git denied to someone.',
	"fatal: unable to access 'https://github.com/a/b.git/': The requested URL returned error: 403"
];

const NETWORK = [
	"fatal: unable to access 'https://github.com/a/b.git/': Could not resolve host: github.com",
	"fatal: unable to access 'https://gitlab.com/a/b.git/': Failed to connect to gitlab.com port 443: Connection timed out",
	'ssh: connect to host github.com port 22: Network is unreachable',
	'ssh: connect to host github.com port 22: Connection refused'
];

describe('classifying why an upload failed', () => {
	it.each(REJECTED)('a remote that moved on: %s', (msg) => {
		expect(classifyPushError(msg)).toBe('rejected');
	});

	it.each(AUTH)('a sign-in problem: %s', (msg) => {
		expect(classifyPushError(msg)).toBe('auth');
	});

	it.each(FORBIDDEN)('an account that may not write here: %s', (msg) => {
		expect(classifyPushError(msg)).toBe('forbidden');
	});

	it.each(NETWORK)('a connection problem: %s', (msg) => {
		expect(classifyPushError(msg)).toBe('network');
	});

	it('a 403 is a permission problem, though it also says it could not access the URL', () => {
		// three regexes match this one, which is the reason the order is fixed rather than incidental
		const msg = "fatal: unable to access 'https://github.com/a/b.git/': The requested URL returned error: 403";
		expect(classifyPushError(msg)).toBe('forbidden');
	});

	it("someone else's repository: ask its owner, rather than make a copy of it", () => {
		const said = uploadReason({ failure: 'forbidden', remote: 'origin' });
		expect(said).toContain('origin');
		expect(said).toContain('add you as a collaborator');
		expect(said).not.toMatch(/fork/i);
	});

	it('falls back rather than guessing, so git gets to speak for itself', () => {
		expect(classifyPushError('error: src refspec main does not match any')).toBe('other');
		expect(classifyPushError('')).toBe('other');
	});
});

// what GitHub prints when push protection stops an upload, trimmed to the lines that matter
const PUSH_PROTECTION = [
	'remote: error: GH013: Repository rule violations found for refs/heads/main.',
	'remote: - GITHUB PUSH PROTECTION',
	'remote:     Resolve the following violations before pushing again',
	'remote:     - Push cannot contain secrets',
	'remote:       —— GitHub Personal Access Token ——————————————————————',
	'remote:        locations:',
	'remote:          - commit: 8728dbe67f5d3a8a4b25eb7b5d23bdd8dd4b0b6d',
	'remote:            path: chapters/data.tex:12',
	'remote:          - commit: 8728dbe67f5d3a8a4b25eb7b5d23bdd8dd4b0b6d',
	'remote:            path: chapters/data.tex:12',
	'remote:        (?) To push, remove secret from commit(s) or follow this URL to allow the secret.',
	'remote:        https://github.com/ada/thesis/security/secret-scanning/unblock-secret/2eMd3zNcZm6j4Bbnr1pFbnRbYfA',
	' ! [remote rejected] main -> main (push declined due to repository rule violations)',
	"error: failed to push some refs to 'https://github.com/ada/thesis'"
].join('\n');

describe("GitHub's own refusals", () => {
	it('names a secret push protection found, where it is, and the page that allows it', () => {
		expect(classifyPushError(PUSH_PROTECTION)).toBe('secret');
		expect(secretLocations(PUSH_PROTECTION)).toEqual(['chapters/data.tex:12']);
		expect(secretAllowUrl(PUSH_PROTECTION)).toBe(
			'https://github.com/ada/thesis/security/secret-scanning/unblock-secret/2eMd3zNcZm6j4Bbnr1pFbnRbYfA'
		);
		expect(uploadReason({ failure: 'secret', error: PUSH_PROTECTION, remote: 'origin' })).toContain('chapters/data.tex:12');
	});

	it('tells a protected branch from a missing permission', () => {
		const msg = [
			'remote: error: GH006: Protected branch update failed for refs/heads/main.',
			'remote: error: Changes must be made through a pull request.',
			' ! [remote rejected] main -> main (protected branch hook declined)'
		].join('\n');
		expect(classifyPushError(msg)).toBe('protected');
	});
});

describe('a sign-in that failed over SSH', () => {
	const REFUSED = 'root@127.0.0.1: Permission denied (publickey).\nfatal: Could not read from remote repository.';
	const CHANGED = [
		'@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
		'@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @',
		'@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
		'Host key verification failed.',
		'fatal: Could not read from remote repository.'
	].join('\n');

	it('is still a sign-in failure', () => {
		expect(classifyPushError(REFUSED)).toBe('auth');
		expect(classifyPushError(CHANGED)).toBe('auth');
	});

	it('talks about the key, not a password or token', () => {
		const refused = uploadReason({ failure: 'auth', error: REFUSED, remote: 'origin' });
		expect(refused).toContain('SSH key');
		expect(refused).not.toContain('credentials');
		expect(uploadReason({ failure: 'auth', error: CHANGED, remote: 'origin' })).toContain('has changed');
	});

	it('leaves a refused password to the usual advice', () => {
		const typed = "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/a/b.git/'";
		expect(uploadReason({ failure: 'auth', error: typed, remote: 'origin' })).toContain('origin');
		expect(uploadReason({ failure: 'auth', error: typed, remote: 'origin' })).not.toContain('has changed');
	});
});
