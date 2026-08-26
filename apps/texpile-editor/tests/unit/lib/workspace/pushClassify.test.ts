// Every one of these failures reaches us as "failed to push some refs", and the four cases want
// four different things done: combine the histories, fix a credential, check the connection, or
// read git's own words. Getting the class wrong sends someone to fix the thing that is not broken.
//
// The strings are what git and the common hosts actually print. Authentication is the one case a
// local bare repo cannot provoke (gitPushLive.test.ts), so it is only ever covered here.
import { describe, it, expect } from 'vitest';
import { classifyPushError } from '../../../../../../electron/src/gitService';

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
	'remote: Permission to a/b.git denied to someone.',
	"fatal: unable to access 'https://github.com/a/b.git/': The requested URL returned error: 403",
	'Host key verification failed.'
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

	it.each(NETWORK)('a connection problem: %s', (msg) => {
		expect(classifyPushError(msg)).toBe('network');
	});

	it('a 403 is a sign-in problem, though it also says it could not access the URL', () => {
		// both regexes match this one, which is the reason the order is fixed rather than incidental
		const msg = "fatal: unable to access 'https://github.com/a/b.git/': The requested URL returned error: 403";
		expect(classifyPushError(msg)).toBe('auth');
	});

	it('falls back rather than guessing, so git gets to speak for itself', () => {
		expect(classifyPushError('error: src refspec main does not match any')).toBe('other');
		expect(classifyPushError('')).toBe('other');
	});
});
