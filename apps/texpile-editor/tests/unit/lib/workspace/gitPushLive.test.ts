// Upload against real repos. A bare repo in a temp dir is a remote in every way that matters here:
// it can be pushed to, it can be moved ahead behind the author's back, and it needs no network and
// no credentials. That covers everything except authentication, which cannot be provoked locally
// and is covered by classification over captured stderr instead (pushClassify.test.ts).
//
// Skips itself when git is not on PATH, like the other live git fixtures.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitPush, gitStatus } from '../../../../../../electron/src/gitService';

function hasGit(): boolean {
	try {
		execFileSync('git', ['--version'], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}
const AVAILABLE = hasGit();

const run = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'ignore' });

function commit(root: string, name: string, body: string, subject: string) {
	writeFileSync(join(root, name), body);
	run(root, 'add', '-A');
	run(root, 'commit', '-q', '-m', subject);
}

function identify(root: string) {
	run(root, 'config', 'user.email', 'test@example.com');
	run(root, 'config', 'user.name', 'Ada Lovelace');
	run(root, 'config', 'commit.gpgsign', 'false');
}

/** a working repo whose branch tracks a bare repo alongside it */
function makeCloned(): { root: string; remote: string; dir: string } {
	const dir = mkdtempSync(join(tmpdir(), 'texpile-push-'));
	const remote = join(dir, 'remote.git');
	const root = join(dir, 'work');
	execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' });

	execFileSync('git', ['clone', '-q', remote, root], { stdio: 'ignore' });
	identify(root);
	commit(root, 'main.tex', '\\documentclass{article}\n', 'First draft');
	// the first push is what establishes the upstream
	run(root, 'push', '-q', '-u', 'origin', 'HEAD');
	return { root, remote, dir };
}

describe.skipIf(!AVAILABLE)('uploading to a remote', () => {
	it('reports what is waiting without touching the network, and clears it on upload', async () => {
		const { root, dir } = makeCloned();
		try {
			commit(root, 'main.tex', '\\documentclass{book}\n', 'Second draft');
			commit(root, 'refs.bib', '@book{a,title={A}}\n', 'Add a reference');

			const before = await gitStatus(root);
			expect(before.ahead).toBe(2);
			expect(before.tracking).toMatch(/^origin\//);

			const res = await gitPush(root);
			expect(res.ok).toBe(true);
			expect(res.remote).toBe('origin');

			const after = await gitStatus(root);
			expect(after.ahead).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('will not fix a remote that moved on, and says which one it was', async () => {
		const { root, remote, dir } = makeCloned();
		try {
			// someone else's version, pushed from a second clone: exactly the case that rejects
			const other = join(dir, 'other');
			execFileSync('git', ['clone', '-q', remote, other], { stdio: 'ignore' });
			identify(other);
			commit(other, 'theirs.tex', 'Theirs.\n', 'Their version');
			run(other, 'push', '-q', 'origin', 'HEAD');

			commit(root, 'mine.tex', 'Mine.\n', 'My version');
			const res = await gitPush(root);
			expect(res.ok).toBe(false);
			expect(res.failure).toBe('rejected');
			expect(res.remote).toBe('origin');

			// left alone: the local version is still there, and nothing was merged in
			const status = await gitStatus(root);
			expect(status.ahead).toBe(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('a branch tracking nothing is not a failed upload', async () => {
		const root = mkdtempSync(join(tmpdir(), 'texpile-push-solo-'));
		try {
			run(root, 'init', '-q');
			identify(root);
			commit(root, 'main.tex', 'Alone.\n', 'First draft');

			const status = await gitStatus(root);
			expect(status.tracking).toBeNull();
			expect(status.ahead).toBe(0);

			const res = await gitPush(root);
			expect(res.ok).toBe(false);
			expect(res.failure).toBe('no-upstream');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('uploading with nothing waiting is not an error', async () => {
		const { root, dir } = makeCloned();
		try {
			expect((await gitStatus(root)).ahead).toBe(0);
			const res = await gitPush(root);
			expect(res.ok).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('pushes to an upstream branch named differently from the local one', async () => {
		const { root, dir } = makeCloned();
		try {
			// `git push` alone refuses this under the default push.default=simple, so the refspec
			// has to be explicit or the case fails with a message about nothing to do with uploading
			run(root, 'branch', '-m', 'local-name');
			run(root, 'branch', '--set-upstream-to', 'origin/master', 'local-name');
			commit(root, 'main.tex', 'Renamed branch.\n', 'Third draft');

			const res = await gitPush(root);
			expect(res.ok).toBe(true);
			expect((await gitStatus(root)).ahead).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
